const crypto = require('crypto');
const { json, supabaseRequest } = require('../_lib/admin-auth');
const { stripeRequest, PLANS } = require('../_lib/stripe-billing');
const { sendTransactionalEmail, welcomeEmail, recordSentEmail } = require('../_lib/transactional-email');

module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifySignature(raw, header, secret) {
  const pieces = String(header || '').split(',').map(value => value.split('='));
  const timestamp = pieces.find(([key]) => key === 't')?.[1];
  const signatures = pieces.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest();
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

function normalizeStatus(status) {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'pending';
}

async function syncSubscription(subscriptionId, clientIdHint) {
  if (!subscriptionId) return;
  let subscription;
  try {
    // Retrieve the current object rather than trusting webhook order. Stripe can redeliver
    // events or deliver an older update after a newer subscription state.
    subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch {
    throw new Error('Impossible de confirmer l’état actuel de l’abonnement Stripe.');
  }
  const clientId = clientIdHint || subscription.metadata?.client_id;
  const filter = clientId
    ? `id=eq.${encodeURIComponent(clientId)}`
    : `provider_subscription_id=eq.${encodeURIComponent(subscription.id)}`;
  const status = normalizeStatus(subscription.status);
  const update = {
    provider: 'stripe',
    provider_subscription_id: subscription.id,
    subscription_status: status
  };
  if (status === 'active') update.stripe_checkout_session_id = null;
  if (status === 'active' && subscription.start_date) update.started_at = new Date(subscription.start_date * 1000).toISOString().slice(0, 10);
  if (status === 'canceled') update.canceled_at = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : new Date().toISOString();
  const rows = await supabaseRequest(`clients?${filter}&select=id`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update)
  });
  if (!rows?.length) throw new Error('Fiche client absente ou impossible à relier à cet abonnement.');
  if (status === 'active') {
    const clients = await supabaseRequest(`clients?id=eq.${encodeURIComponent(rows[0].id)}&select=brief_id`);
    const briefId = clients?.[0]?.brief_id;
    if (briefId) {
      const briefUpdate = { status: 'converti' };
      if (subscription.metadata?.plan) briefUpdate.plan_interest = subscription.metadata.plan;
      await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(briefUpdate)
      });
    }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SECRET_KEY) {
    return json(res, 503, { error: 'La synchronisation Stripe n’est pas configurée.' });
  }

  try {
    const raw = await readRawBody(req);
    if (raw.length > 1_000_000) return json(res, 413, { error: 'Événement trop volumineux.' });
    if (!verifySignature(raw, req.headers['stripe-signature'], secret)) return json(res, 400, { error: 'Signature Stripe invalide.' });
    const event = JSON.parse(raw.toString('utf8'));
    const object = event.data?.object;

    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')
      && object?.mode === 'subscription' && object?.subscription
      && ['paid', 'no_payment_required'].includes(object.payment_status)) {
      await syncSubscription(object.subscription, object.client_reference_id || object.metadata?.client_id);
      const clientId = object.client_reference_id || object.metadata?.client_id;
      const clients = await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,brief_id,company_name,contact_name,contact_email,plan,monthly_price_cents,welcome_email_sent_at`);
      const client = clients?.[0];
      const plan = PLANS[String(object.metadata?.plan || '').toLowerCase()];
      if (!client || !plan) throw new Error('Impossible de préparer le courriel de bienvenue : fiche client ou formule absente.');
      if (!client.welcome_email_sent_at) {
        try {
          const mail = welcomeEmail(client, plan, Number.isInteger(object.amount_total) ? object.amount_total : plan.monthly + plan.creation);
          const providerId = await sendTransactionalEmail({
            to: client.contact_email,
            ...mail,
            idempotencyKey: `payment-welcome-${object.id}`
          });
          await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: client.contact_email, category: 'payment-welcome', ...mail, providerId });
        } catch (emailError) {
          try {
            await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, {
              method: 'PATCH', headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ welcome_email_last_error: String(emailError.message || 'Erreur de messagerie').slice(0, 500) })
            });
          } catch {}
          throw emailError;
        }
        await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ welcome_email_sent_at: new Date().toISOString(), welcome_email_last_error: null })
        });
      }
    }
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.paused'
      || event.type === 'customer.subscription.resumed') {
      await syncSubscription(object?.id, object?.metadata?.client_id);
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const subscriptionId = object?.subscription || object?.parent?.subscription_details?.subscription;
      if (subscriptionId) await syncSubscription(subscriptionId);
    }
    return json(res, 200, { received: true });
  } catch (error) {
    console.error('Traitement webhook Stripe impossible:', error.message);
    return json(res, 500, { error: 'Traitement de l’événement Stripe impossible.' });
  }
};
