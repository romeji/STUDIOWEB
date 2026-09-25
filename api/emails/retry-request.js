const { json, requireAdmin, supabaseRequest } = require('../_lib/admin-auth');
const { sendTransactionalEmail, receivedEmail, recordSentEmail } = require('../_lib/transactional-email');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!await requireAdmin(req, res)) return;
  const briefId = String(req.body?.briefId || '');
  if (!UUID.test(briefId)) return json(res, 400, { error: 'Demande client invalide.' });
  try {
    const rows = await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}&select=id,company_name,contact_name,contact_email,request_email_sent_at`);
    const brief = rows?.[0];
    if (!brief) return json(res, 404, { error: 'Demande introuvable.' });
    if (brief.request_email_sent_at) return json(res, 409, { error: 'Le courriel de confirmation est déjà marqué comme envoyé.' });
    const mail = receivedEmail(brief);
    const providerId = await sendTransactionalEmail({ to: brief.contact_email, ...mail, idempotencyKey: `request-received-${brief.id}` });
    await recordSentEmail({ briefId, to: brief.contact_email, category: 'questionnaire-received', ...mail, providerId });
    await supabaseRequest(`briefs?id=eq.${encodeURIComponent(brief.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ request_email_sent_at: new Date().toISOString(), email_last_error: null })
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Nouvel envoi du courriel de confirmation impossible:', error.message);
    try {
      await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ email_last_error: String(error.message || 'Erreur e-mail').slice(0, 500) })
      });
    } catch {}
    return json(res, 502, { error: 'Le courriel n’a pas pu être envoyé. Vérifiez Resend puis réessayez.' });
  }
};
