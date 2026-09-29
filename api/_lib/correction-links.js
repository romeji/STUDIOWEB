'use strict';

const crypto = require('crypto');

function correctionSecret() {
  return process.env.CORRECTION_LINK_SECRET || process.env.SUPABASE_SECRET_KEY;
}

function createCustomerToken(clientId, purpose = 'correction', secret = correctionSecret()) {
  if (!secret) throw new Error('La génération du lien de retouche nécessite une clé secrète serveur.');
  if (!['correction', 'cancellation', 'withdrawal'].includes(purpose)) throw new Error('Type de lien client invalide.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(clientId || ''))) {
    throw new Error('Identifiant client invalide.');
  }
  const signature = crypto.createHmac('sha256', secret)
    .update(`jl-studio-${purpose}-v1:${String(clientId).toLowerCase()}`)
    .digest('base64url');
  return `${String(clientId).toLowerCase()}.${signature}`;
}

function readCustomerToken(token, purpose = 'correction', secret = correctionSecret()) {
  if (!secret || typeof token !== 'string') return null;
  if (!['correction', 'cancellation', 'withdrawal'].includes(purpose)) return null;
  const match = token.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i);
  if (!match) return null;
  const clientId = match[1].toLowerCase();
  const expected = crypto.createHmac('sha256', secret)
    .update(`jl-studio-${purpose}-v1:${clientId}`)
    .digest();
  let received;
  try { received = Buffer.from(match[2], 'base64url'); } catch { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  return clientId;
}

const createCorrectionToken = (clientId, secret) => createCustomerToken(clientId, 'correction', secret);
const readCorrectionClientId = (token, secret) => readCustomerToken(token, 'correction', secret);
const createCancellationToken = (clientId, secret) => createCustomerToken(clientId, 'cancellation', secret);
const readCancellationClientId = (token, secret) => readCustomerToken(token, 'cancellation', secret);
const createWithdrawalToken = (clientId, secret) => createCustomerToken(clientId, 'withdrawal', secret);
const readWithdrawalClientId = (token, secret) => readCustomerToken(token, 'withdrawal', secret);

module.exports = { createCustomerToken, readCustomerToken, createCorrectionToken, readCorrectionClientId, createCancellationToken, readCancellationClientId, createWithdrawalToken, readWithdrawalClientId };
