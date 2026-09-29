const { json, supabaseRequest } = require('../admin-auth');
const { stripeRequest } = require('../stripe-billing');
const { readCancellationClientId } = require('../correction-links');
const { sendTransactionalEmail, cancellationScheduledEmail, recordSentEmail } = require('../transactional-email');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SECRET_KEY) return json(res, 503, { error: 'La résiliation en ligne n’est pas disponible pour le moment.' });
  try {
    const clientId = readCancellationClientId(String(req.body?.token || ''));
    if (!clientId) return json(res, 400, { error: 'Ce lien de résiliation est invalide. Demandez-en un nouveau par e-mail.' });
    const clients = await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,brief_id,provider,provider_subscription_id,subscription_status,contact_email,contact_name,company_name,cancellation_requested_at,cancellation_effective_at`);
    const client = clients?.[0];
    if (!client || client.provider !== 'stripe' || !client.provider_subscription_id) return json(res, 404, { error: 'Aucun abonnement Stripe ne correspond à ce lien.' });
    if (client.cancellation_effective_at) return json(res, 200, { ok: true, alreadyScheduled: true, effectiveAt: client.cancellation_effective_at });
    const current = await stripeRequest(`subscriptions/${encodeURIComponent(client.provider_subscription_id)}`);
    if (current.status === 'canceled') {
      const effectiveEnd = current.ended_at || current.cancel_at || current.current_period_end || current.canceled_at;
      return json(res, 200, { ok: true, alreadyCanceled: true, effectiveAt: effectiveEnd ? new Date(effectiveEnd * 1000).toISOString() : null });
    }
    if (!['active', 'past_due', 'trialing', 'unpaid'].includes(current.status)) return json(res, 409, { error: 'Cet abonnement ne peut pas être résilié en ligne dans son état actuel. Contactez contact@jlstudioweb.fr.' });
    const updated = current.cancel_at_period_end
      ? current
      : await stripeRequest(`subscriptions/${encodeURIComponent(current.id)}`, {
        method: 'POST', params: new URLSearchParams({ cancel_at_period_end: 'true' }),
        idempotencyKey: `jl-studio-customer-cancel-period-end-${current.id}-${Date.now()}`
      });
    const effectiveAt = new Date(Number(updated.cancel_at || updated.current_period_end) * 1000).toISOString();
    const requestedAt = new Date().toISOString();
    await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ cancellation_requested_at: requestedAt, cancellation_effective_at: effectiveAt, subscription_status: 'active' })
    });
    const mail = cancellationScheduledEmail(client, effectiveAt);
    const providerId = await sendTransactionalEmail({ to: client.contact_email, ...mail, idempotencyKey: `subscription-cancellation-${client.id}-${effectiveAt}` });
    await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: client.contact_email, category: 'subscription-cancellation', ...mail, providerId });
    return json(res, 200, { ok: true, effectiveAt });
  } catch (error) {
    console.error('Demande de résiliation impossible:', error.message);
    return json(res, 500, { error: 'La demande n’a pas pu être enregistrée. Réessayez ou écrivez à contact@jlstudioweb.fr.' });
  }
};
