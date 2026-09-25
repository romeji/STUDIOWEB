const { json, requireAdmin, supabaseRequest } = require('../_lib/admin-auth');
const { sendTransactionalEmail, inboundNotificationEmail } = require('../_lib/transactional-email');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!await requireAdmin(req, res)) return;
  const id = String(req.body?.messageId || '');
  if (!UUID.test(id)) return json(res, 400, { error: 'Message invalide.' });
  try {
    const rows = await supabaseRequest(`client_messages?id=eq.${encodeURIComponent(id)}&select=id,kind,name,company_name,email,phone,postal_code,activity,callback_time,subject,message,notification_sent_at`);
    const message = rows?.[0];
    if (!message) return json(res, 404, { error: 'Message introuvable.' });
    if (message.notification_sent_at) return json(res, 409, { error: 'La notification est déjà marquée comme envoyée.' });
    const mail = inboundNotificationEmail(message);
    await sendTransactionalEmail({ to: 'lopes.jerome21@gmail.com', ...mail, replyTo: message.email, idempotencyKey: `inbound-admin-${message.id}` });
    await supabaseRequest(`client_messages?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ notification_sent_at: new Date().toISOString(), notification_error: null })
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Nouvel envoi de notification impossible:', error.message);
    try { await supabaseRequest(`client_messages?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notification_error: String(error.message || 'Erreur e-mail').slice(0, 500) }) }); } catch {}
    return json(res, 502, { error: 'Impossible d’envoyer la notification. Vérifiez Resend puis réessayez.' });
  }
};
