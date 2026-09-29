const crypto = require('node:crypto');
const { json, requireAdmin, supabaseRequest } = require('../_lib/admin-auth');
const { sendTransactionalEmail } = require('../_lib/transactional-email');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!await requireAdmin(req, res)) return;

  const prospectId = String(req.body?.prospectId || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const text = String(req.body?.text || '').trim();
  const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(prospectId)) return json(res, 400, { error: 'Prospect invalide.' });
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return json(res, 400, { error: 'Clé de demande invalide.' });
  if (req.body?.confirmedReview !== true) return json(res, 400, { error: 'Confirmez la vérification de l’adresse et du message avant l’envoi.' });
  if (!subject || subject.length > 180 || /[\r\n]/.test(subject) || !text || text.length > 12000) return json(res, 400, { error: 'Objet ou message invalide.' });

  try {
    const rows = await supabaseRequest(`prospects?id=eq.${encodeURIComponent(prospectId)}&select=id,company_name,email,status,classification&limit=1`);
    const prospect = rows?.[0];
    if (!prospect) return json(res, 404, { error: 'Prospect introuvable.' });
    const recipient = String(prospect.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return json(res, 400, { error: 'Enregistrez d’abord une adresse e-mail vérifiée sur la fiche.' });
    if (prospect.status !== 'a_contacter' || prospect.classification !== 'a_qualifier') {
      return json(res, 409, { error: 'Ce prospect est classé ou déjà contacté. Réouvrez sa fiche avant tout nouvel envoi.' });
    }

    const existing = await supabaseRequest(`prospect_emails?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,provider_message_id&limit=1`);
    if (existing?.[0]?.status === 'sent') return json(res, 200, { ok: true, alreadySent: true });
    if (!existing?.length) {
      await supabaseRequest('prospect_emails', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ prospect_id: prospectId, recipient_email: recipient, subject, body_text: text, idempotency_key: idempotencyKey, status: 'sending' })
      });
    }

    let providerMessageId;
    try {
      const paragraphs = text.split(/\n\s*\n/).map(line => `<p style="margin:0 0 16px;line-height:1.65">${escapeHtml(line).replace(/\n/g, '<br>')}</p>`).join('');
      providerMessageId = await sendTransactionalEmail({
        to: recipient,
        subject,
        text,
        html: `<div style="font-family:Arial,sans-serif;color:#25243b;max-width:620px;margin:auto;padding:24px">${paragraphs}</div>`,
        idempotencyKey: `prospect-${idempotencyKey}`,
        replyTo: 'contact@jlstudioweb.fr'
      });
    } catch (error) {
      await supabaseRequest(`prospect_emails?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', error_message: String(error.message || 'Erreur d’envoi').slice(0, 1000) })
      }).catch(() => {});
      return json(res, 502, { error: 'L’e-mail n’a pas été envoyé. Le prospect reste dans « À prospecter ». Vérifiez Resend avant une nouvelle tentative.' });
    }

    const sentAt = new Date().toISOString();
    try {
      await supabaseRequest(`prospect_emails?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'sent', provider_message_id: providerMessageId, error_message: '' })
      });
      await supabaseRequest(`prospects?id=eq.${encodeURIComponent(prospectId)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'prospecte', contacted_at: sentAt, last_prospected_at: sentAt })
      });
    } catch {
      return json(res, 200, { ok: true, sent: true, trackingPending: true, message: 'E-mail envoyé. Le suivi Supabase n’a pas pu être actualisé ; ne renvoyez pas le message et actualisez le dashboard.' });
    }
    return json(res, 200, { ok: true, sent: true, companyName: prospect.company_name, sentAt });
  } catch (error) {
    console.error('Prospect email error:', error.message);
    return json(res, 500, { error: 'Impossible de préparer l’envoi. Vérifiez la configuration et réessayez.' });
  }
};
