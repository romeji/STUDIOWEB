const crypto = require('crypto');
const { checkRateLimit, saveMessage, sendInboundNotifications } = require('./_lib/inbound-messages');

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Méthode non autorisée.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return respond(res, 503, { error: 'Le formulaire de contact est momentanément indisponible. Écrivez directement à jerome.lopes21@gmail.com.' });
  const data = req.body && typeof req.body === 'object' ? req.body : {};
  if (data.website) return respond(res, 200, { ok: true });
  const required = ['nom', 'prenom', 'code_postal', 'telephone', 'email', 'activite', 'message'];
  if (required.some(key => !String(data[key] || '').trim()) || data.consent !== true) return respond(res, 400, { error: 'Complétez les champs obligatoires et confirmez la politique de confidentialité.' });
  const email = String(data.email).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(res, 400, { error: 'Adresse e-mail invalide.' });
  if (!/^\d{5}$/.test(String(data.code_postal))) return respond(res, 400, { error: 'Le code postal doit contenir 5 chiffres.' });
  if (String(data.message).length > 8000) return respond(res, 413, { error: 'Le message est trop long (8 000 caractères maximum).' });
  try {
    if (!await checkRateLimit(req)) return respond(res, 429, { error: 'Trop de messages ont été envoyés. Réessayez un peu plus tard.' });
    const clientsResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/clients?contact_email=eq.${encodeURIComponent(email)}&select=id&limit=1`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
    const clients = clientsResponse.ok ? await clientsResponse.json() : [];
    const message = {
      id: crypto.randomUUID(), kind: 'contact', status: 'new', direction: 'inbound',
      name: `${String(data.prenom).trim()} ${String(data.nom).trim()}`.slice(0, 180),
      company_name: String(data.societe || '').trim().slice(0, 180), email,
      phone: String(data.telephone).trim().slice(0, 60), postal_code: String(data.code_postal),
      activity: String(data.activite).trim().slice(0, 180), callback_time: String(data.moment || '').slice(0, 40),
      subject: `Demande de contact JL Studio — ${String(data.prenom).trim()} ${String(data.nom).trim()}`.slice(0, 240),
      message: String(data.message).trim(), client_id: clients?.[0]?.id || null, brief_id: null
    };
    let stored = false;
    let storeError = '';
    try { await saveMessage(message); stored = true; }
    catch (error) { storeError = error.message; console.error('Message contact non archivé:', error.message); }
    const sent = await sendInboundNotifications(message);
    if (stored) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/client_messages?id=eq.${encodeURIComponent(message.id)}`, {
        method: 'PATCH', headers: { apikey: process.env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ notification_sent_at: sent.notificationSent ? new Date().toISOString() : null, acknowledgement_sent_at: sent.acknowledgementSent ? new Date().toISOString() : null, notification_error: sent.notificationError || storeError || null })
      }).catch(error => console.error('État du message non enregistré:', error.message));
    }
    if (!sent.notificationSent && !stored) return respond(res, 502, { error: 'Le message n’a pas pu être transmis. Écrivez directement à jerome.lopes21@gmail.com.' });
    const messageText = stored
      ? sent.acknowledgementSent ? 'Votre message est transmis et enregistré. Un accusé de réception vient de vous être envoyé par e-mail.' : 'Votre message est enregistré dans le suivi JL Studio. L’accusé de réception e-mail est momentanément indisponible.'
      : sent.notificationSent ? 'Votre message a été envoyé par e-mail à JL Studio.' : 'Votre message a été transmis, mais l’archivage et l’e-mail sont momentanément indisponibles.';
    return respond(res, 201, { ok: true, stored, notificationSent: sent.notificationSent, message: messageText });
  } catch (error) {
    console.error('Message contact impossible:', error.message);
    return respond(res, 500, { error: 'Impossible d’envoyer votre message pour le moment. Écrivez directement à jerome.lopes21@gmail.com.' });
  }
};
