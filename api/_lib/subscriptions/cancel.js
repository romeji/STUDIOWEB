const ADMIN_EMAIL = 'lopes.jerome21@gmail.com';
const { stripeRequest } = require('../stripe-billing');
const { json, supabaseRequest } = require('../admin-auth');
const { cancellationScheduledEmail, sendTransactionalEmail, recordSentEmail } = require('../transactional-email');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !STRIPE_SECRET_KEY) return json(res, 503, { error: 'Ajoutez les clés Stripe et Supabase à Vercel pour activer la résiliation.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { error: 'Connexion administrateur requise.' });
  try {
    const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } });
    if (!auth.ok) return json(res, 401, { error: 'Session expirée. Reconnectez-vous.' });
    const user = await auth.json();
    if (String(user.email || '').toLowerCase() !== ADMIN_EMAIL) return json(res, 403, { error: 'Accès refusé.' });
    const clientId = req.body?.clientId;
    if (!clientId) return json(res, 400, { error: 'Client manquant.' });
    const rows = await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,provider,provider_subscription_id,contact_email,contact_name,company_name,brief_id,cancellation_effective_at`);
    const client = rows?.[0];
    if (!client || client.provider !== 'stripe' || !client.provider_subscription_id) return json(res, 409, { error: 'Cet abonnement n’est pas relié à Stripe.' });
    const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(client.provider_subscription_id)}`);
    if (subscription.status === 'canceled') return json(res, 409, { error: 'Cet abonnement est déjà terminé.' });
    const updated = subscription.cancel_at_period_end
      ? subscription
      : await stripeRequest(`subscriptions/${encodeURIComponent(subscription.id)}`, {
        method: 'POST', params: new URLSearchParams({ cancel_at_period_end: 'true' }),
        idempotencyKey: `jl-studio-cancel-period-end-${subscription.id}-${Date.now()}`
      });
    const effectiveAt = new Date(Number(updated.cancel_at || updated.current_period_end) * 1000).toISOString();
    await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ cancellation_requested_at: client.cancellation_effective_at ? undefined : new Date().toISOString(), cancellation_effective_at: effectiveAt, subscription_status: 'active' })
    });
    if (!client.cancellation_effective_at && client.contact_email) {
      const mail = cancellationScheduledEmail(client, effectiveAt);
      const providerId = await sendTransactionalEmail({ to: client.contact_email, ...mail, idempotencyKey: `admin-cancellation-${client.id}-${effectiveAt}` });
      await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: client.contact_email, category: 'subscription-cancellation', ...mail, providerId });
    }
    return json(res, 200, { ok: true, effectiveAt });
  } catch (error) {
    console.error('Résiliation impossible:', error.message);
    return json(res, 500, { error: error.message || 'Erreur serveur.' });
  }
};
