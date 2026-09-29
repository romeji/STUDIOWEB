const { checkRateLimit } = require('../inbound-messages');
const { sendTransactionalEmail, cancellationLinkEmail, recordSentEmail } = require('../transactional-email');
const { createCancellationToken } = require('../correction-links');
const { SITE_URL } = require('../site-url');
const { json, supabaseRequest } = require('../admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return json(res, 503, { error: 'Le service de résiliation n’est pas disponible pour le moment.' });
  try {
    if (!await checkRateLimit(req)) return json(res, 429, { error: 'Trop de demandes. Réessayez plus tard.' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Saisissez une adresse e-mail valide.' });
    const clients = await supabaseRequest(`clients?contact_email=ilike.${encodeURIComponent(email)}&provider=eq.stripe&select=id,brief_id,contact_email,contact_name,company_name,provider_subscription_id,subscription_status&order=created_at.desc&limit=10`);
    const client = (clients || []).find(item => item.provider_subscription_id && ['active', 'past_due'].includes(item.subscription_status));
    if (client) {
      const token = createCancellationToken(client.id);
      const url = `${SITE_URL}/resiliation?token=${encodeURIComponent(token)}`;
      const mail = cancellationLinkEmail(client, url);
      const providerId = await sendTransactionalEmail({ to: client.contact_email, ...mail, idempotencyKey: `cancellation-link-${client.id}-${Date.now()}` });
      await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: client.contact_email, category: 'subscription-cancellation-link', ...mail, providerId });
    }
    return json(res, 200, { ok: true, message: 'Si un abonnement actif correspond à cette adresse, vous recevrez un e-mail avec un lien sécurisé pour confirmer sa résiliation.' });
  } catch (error) {
    console.error('Envoi du lien de résiliation impossible:', error.message);
    return json(res, 500, { error: 'Impossible d’envoyer le lien pour le moment. Réessayez ou contactez contact@jlstudioweb.fr.' });
  }
};
