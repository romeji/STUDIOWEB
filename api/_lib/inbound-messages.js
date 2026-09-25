const crypto = require('crypto');
const { sendTransactionalEmail, inboundNotificationEmail, inboundAcknowledgementEmail, recordSentEmail } = require('./transactional-email');

const OWNER_EMAIL = 'lopes.jerome21@gmail.com';

function ipHash(req, secret) {
  const forwarded = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  return crypto.createHash('sha256').update(`${secret}:${forwarded}`).digest('hex');
}

async function checkRateLimit(req) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_brief_submission`, {
    method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ip_hash: ipHash(req, SUPABASE_SECRET_KEY) })
  });
  if (!response.ok) throw new Error('La protection anti-abus Supabase n’est pas disponible.');
  return response.json();
}

async function saveMessage(message) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/client_messages`, {
    method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(message)
  });
  if (!response.ok) throw new Error(`La boîte de réception Supabase a refusé le message (${response.status}).`);
}

async function sendInboundNotifications(message) {
  let notificationSent = false;
  let notificationError = '';
  let acknowledgementSent = false;
  const notification = inboundNotificationEmail(message);
  try {
    await sendTransactionalEmail({ to: OWNER_EMAIL, ...notification, replyTo: message.email, idempotencyKey: `inbound-admin-${message.id}` });
    notificationSent = true;
  } catch (error) {
    notificationError = String(error.message || 'Erreur d’envoi').slice(0, 500);
    console.error('Notification de message non envoyée:', notificationError);
  }
  const acknowledgement = inboundAcknowledgementEmail(message);
  try {
    const id = await sendTransactionalEmail({ to: message.email, ...acknowledgement, idempotencyKey: `inbound-ack-${message.id}` });
    acknowledgementSent = true;
    await recordSentEmail({ briefId: message.brief_id, clientId: message.client_id, to: message.email, category: `${message.kind}-acknowledgement`, ...acknowledgement, providerId: id });
  } catch (error) {
    console.error('Accusé de réception client non envoyé:', error.message);
    if (!notificationError) notificationError = `Notification admin envoyée; accusé client en échec: ${String(error.message || 'Erreur').slice(0, 350)}`;
  }
  return { notificationSent, acknowledgementSent, notificationError };
}

module.exports = { checkRateLimit, saveMessage, sendInboundNotifications };
