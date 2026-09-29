const { json, supabaseRequest } = require('../admin-auth');
const { sendTransactionalEmail, recordSentEmail } = require('../transactional-email');
const { createWithdrawalToken } = require('../correction-links');
const { checkRateLimit } = require('../inbound-messages');
const { SITE_URL } = require('../site-url');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Saisissez une adresse e-mail valide.' });
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SECRET_KEY) return json(res, 503, { error: 'Ce service est momentanément indisponible.' });
  try {
    const allowed = await checkRateLimit(req);
    if (allowed === false || allowed?.allowed === false) return json(res, 429, { error: 'Trop de demandes. Réessayez plus tard.' });
    const safePattern = email.replace(/[\\%_]/g, '\\$&');
    const encoded = encodeURIComponent(safePattern);
    const rows = await supabaseRequest(`clients?contact_email=ilike.${encoded}&customer_type=eq.consumer&select=id,brief_id,contact_email,company_name,contract_started_at,started_at,withdrawal_requested_at&order=created_at.desc&limit=5`);
    const client = rows?.find(item => {
      const start = new Date(item.contract_started_at || item.started_at).getTime();
      return Number.isFinite(start) && Date.now() <= start + 14 * 86400000 && !item.withdrawal_requested_at;
    });
    if (client) {
      const url = `${SITE_URL}/retractation?token=${encodeURIComponent(createWithdrawalToken(client.id))}`;
      const subject = 'Votre lien de rétractation — JL Studio Web';
      const text = `Bonjour,\n\nVous avez demandé l’accès au formulaire de rétractation pour votre contrat JL Studio Web concernant ${client.company_name}.\n\nOuvrir le formulaire sécurisé : ${url}\n\nLe lien est personnel et valable pendant le délai légal de 14 jours à compter de la conclusion du contrat. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n\nJL Studio Web`;
      const html = `<div style="font-family:Arial,sans-serif;color:#28243b;max-width:620px;margin:auto;padding:28px"><h1>Votre lien de rétractation</h1><p>Vous avez demandé l’accès au formulaire concernant <strong>${client.company_name}</strong>.</p><p><a href="${url}" style="display:inline-block;padding:13px 18px;border-radius:9px;background:#6957cf;color:white;text-decoration:none">Ouvrir le formulaire sécurisé</a></p><p>Ce lien personnel fonctionne pendant le délai légal de 14 jours à compter de votre contrat. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p><p>JL Studio Web · contact@jlstudioweb.fr</p></div>`;
      const providerId = await sendTransactionalEmail({ to: client.contact_email, subject, html, text, idempotencyKey: `withdrawal-link-${client.id}-${Math.floor(Date.now() / 60000)}` });
      await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: client.contact_email, category: 'withdrawal-link', subject, text, providerId });
    }
    return json(res, 200, { ok: true, message: 'Si un contrat consommateur correspondant est encore dans le délai, un lien sécurisé vient d’être envoyé à cette adresse.' });
  } catch (error) {
    console.error('Envoi du lien de rétractation impossible:', error.message);
    return json(res, 503, { error: 'Impossible d’envoyer le lien pour le moment. Écrivez à contact@jlstudioweb.fr.' });
  }
};
