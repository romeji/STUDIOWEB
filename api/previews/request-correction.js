const crypto = require('crypto');
const { checkRateLimit, saveMessage, sendInboundNotifications } = require('../_lib/inbound-messages');

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Méthode non autorisée.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return respond(res, 503, { error: 'Ce formulaire est indisponible. Contactez JL Studio par e-mail.' });
  const token = String(req.body?.token || '');
  const content = String(req.body?.message || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return respond(res, 400, { error: 'Lien de maquette invalide.' });
  if (req.body?.consent !== true) return respond(res, 400, { error: 'Confirmez le traitement de votre demande pour pouvoir la transmettre.' });
  if (content.length < 5 || content.length > 8000) return respond(res, 400, { error: 'Décrivez votre demande (5 à 8 000 caractères).' });
  try {
    if (!await checkRateLimit(req)) return respond(res, 429, { error: 'Trop de messages ont été envoyés. Réessayez un peu plus tard.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const found = await fetch(`${process.env.SUPABASE_URL}/rest/v1/briefs?preview_token_hash=eq.${encodeURIComponent(tokenHash)}&preview_expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,company_name,contact_name,contact_email,contact_phone&limit=1`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
    const briefs = found.ok ? await found.json() : [];
    const brief = briefs?.[0];
    if (!brief) return respond(res, 404, { error: 'Cette maquette a expiré ou n’est plus disponible. Contactez JL Studio pour obtenir de l’aide.' });
    const clientsResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/clients?brief_id=eq.${encodeURIComponent(brief.id)}&select=id&limit=1`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
    const clients = clientsResponse.ok ? await clientsResponse.json() : [];
    const message = {
      id: crypto.randomUUID(), kind: 'correction', status: 'new', direction: 'inbound',
      name: brief.contact_name || '', company_name: brief.company_name, email: brief.contact_email,
      phone: brief.contact_phone || '', subject: `Correction de maquette — ${brief.company_name}`,
      message: content, brief_id: brief.id, client_id: clients?.[0]?.id || null
    };
    let stored = false;
    let storeError = '';
    try { await saveMessage(message); stored = true; }
    catch (error) { storeError = error.message; console.error('Demande correction non archivée:', error.message); }
    const sent = await sendInboundNotifications(message);
    if (stored) await fetch(`${process.env.SUPABASE_URL}/rest/v1/client_messages?id=eq.${encodeURIComponent(message.id)}`, {
      method: 'PATCH', headers: { apikey: process.env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ notification_sent_at: sent.notificationSent ? new Date().toISOString() : null, acknowledgement_sent_at: sent.acknowledgementSent ? new Date().toISOString() : null, notification_error: sent.notificationError || storeError || null })
    }).catch(error => console.error('État de correction non enregistré:', error.message));
    if (!sent.notificationSent && !stored) return respond(res, 502, { error: 'La demande n’a pas pu être transmise. Écrivez à JL Studio.' });
    const messageText = sent.acknowledgementSent
      ? 'Votre demande est transmise à JL Studio. Un accusé de réception vient de vous être envoyé par e-mail.'
      : stored ? 'Votre demande est enregistrée dans le suivi JL Studio. L’accusé de réception e-mail est momentanément indisponible.' : 'Votre demande a été envoyée par e-mail à JL Studio.';
    return respond(res, 201, { ok: true, stored, notificationSent: sent.notificationSent, message: messageText });
  } catch (error) {
    console.error('Demande de correction impossible:', error.message);
    return respond(res, 500, { error: 'Impossible de transmettre votre demande. Contactez JL Studio par e-mail.' });
  }
};
