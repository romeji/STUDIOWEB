const ADMIN_EMAIL = 'lopes.jerome21@gmail.com';
const { stripeRequest } = require('../_lib/stripe-billing');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, STRIPE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY || !STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Ajoutez les clés Stripe et Supabase à Vercel pour activer la résiliation en ligne.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Connexion administrateur requise.' });
  try {
    const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } });
    if (!auth.ok) return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
    const user = await auth.json();
    if (String(user.email || '').toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: 'Accès refusé.' });
    const { clientId } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'Client manquant.' });
    const dbHeaders = { apikey: SUPABASE_SECRET_KEY };
    const result = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,provider,provider_subscription_id`, { headers: dbHeaders });
    if (!result.ok) throw new Error('Lecture de l’abonnement impossible.');
    const [client] = await result.json();
    if (!client || client.provider !== 'stripe' || !client.provider_subscription_id) return res.status(409).json({ error: 'Cet abonnement n’est pas lié à Stripe. Contactez le client et clôturez son dossier après confirmation.' });
    try {
      await stripeRequest(`subscriptions/${encodeURIComponent(client.provider_subscription_id)}`, { method: 'DELETE' });
    } catch (stripeError) {
      return res.status(502).json({ error: stripeError.message || 'Stripe n’a pas confirmé la résiliation.' });
    }
    const update = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}`, { method: 'PATCH', headers: { ...dbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ subscription_status: 'canceled', canceled_at: new Date().toISOString() }) });
    if (!update.ok) throw new Error('Stripe a confirmé la résiliation, mais la fiche Supabase n’a pas pu être mise à jour.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Résiliation impossible:', error.message);
    return res.status(500).json({ error: error.message || 'Erreur serveur.' });
  }
};
