const MAX_TOTAL_IMAGE_BYTES = 2_500_000;
const MAX_IMAGE_BYTES = 500_000;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const { sendTransactionalEmail, receivedEmail, recordSentEmail } = require('./_lib/transactional-email');
const { waitUntil } = require('@vercel/functions');
const { generateBriefSite } = require('./_lib/ai-site-generation');

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Méthode non autorisée.' });
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return respond(res, 503, { error: 'Le stockage des demandes Supabase n’est pas encore configuré.' });

  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    if (payload.website) return respond(res, 200, { ok: true });
    const answers = payload.answers;
    if (!answers || typeof answers !== 'object' || !answers.user_email || !answers.company_name || payload.consent !== true) {
      return respond(res, 400, { error: 'Les champs obligatoires ou le consentement sont manquants.' });
    }
    if (!Array.isArray(payload.photos) || payload.photos.length > 6) return respond(res, 400, { error: 'Six images maximum sont acceptées.' });
    const email = String(answers.user_email).trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(res, 400, { error: 'Adresse e-mail invalide.' });
    const forwarded = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const ipHash = require('crypto').createHash('sha256').update(`${SUPABASE_SECRET_KEY}:${forwarded}`).digest('hex');
    const rate = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_brief_submission`, {
      method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ip_hash: ipHash })
    });
    if (!rate.ok) throw new Error(`La limite anti-abus Supabase n’est pas configurée (${rate.status}).`);
    if (await rate.json() !== true) return respond(res, 429, { error: 'Trop de demandes ont été envoyées depuis cette connexion. Réessayez un peu plus tard.' });
    let totalBytes = 0;
    const photoPaths = [];
    const id = crypto.randomUUID();
    for (let index = 0; index < payload.photos.length; index += 1) {
      const photo = payload.photos[index];
      if (!photo || !allowedTypes.has(photo.type) || typeof photo.data !== 'string' || !photo.data.startsWith(`data:${photo.type};base64,`) || photo.data.length > 700000) {
        return respond(res, 400, { error: 'Format d’image invalide. Utilisez JPEG, PNG ou WebP.' });
      }
      const comma = photo.data.indexOf(',');
      const buffer = Buffer.from(photo.data.slice(comma + 1), 'base64');
      totalBytes += buffer.length;
      if (!comma || buffer.length > MAX_IMAGE_BYTES || totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        return respond(res, 413, { error: 'Réduisez la taille des photos avant de réessayer (500 Ko par photo, 2,5 Mo au total).' });
      }
      const signature = buffer.subarray(0, 12).toString('hex');
      const imageMatchesType = photo.type === 'image/jpeg' ? signature.startsWith('ffd8ff') : photo.type === 'image/png' ? signature.startsWith('89504e470d0a1a0a') : signature.startsWith('52494646') && buffer.subarray(8, 12).toString() === 'WEBP';
      if (!imageMatchesType) return respond(res, 400, { error: 'Le fichier transmis ne correspond pas à un format d’image accepté.' });
      const ext = photo.type === 'image/jpeg' ? 'jpg' : photo.type.split('/')[1];
      const path = `${id}/${index + 1}.${ext}`;
      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/brief-photos/${path}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': photo.type, 'x-upsert': 'false' },
        body: buffer
      });
      if (!upload.ok) throw new Error(`Supabase Storage a refusé l’image (${upload.status}).`);
      photoPaths.push(path);
    }

    const row = {
      id,
      company_name: String(answers.company_name).slice(0, 180),
      contact_name: String(answers.user_name || '').slice(0, 180),
      contact_email: email.toLowerCase(),
      contact_phone: String(answers.user_phone || '').slice(0, 60),
      plan_interest: String(answers.formula || '').slice(0, 40),
      answers,
      generated_prompt: String(payload.prompt || '').slice(0, 50000),
      photo_paths: photoPaths,
      status: 'nouveau',
      ai_generation_status: 'pending'
    };
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/briefs`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
    if (!insert.ok) throw new Error(`Supabase Database a refusé la demande (${insert.status}).`);
    let requestEmailSent = false;
    const emailPatch = {};
    try {
      const mail = receivedEmail(row);
      const providerId = await sendTransactionalEmail({ to: email, ...mail, idempotencyKey: `request-received-${id}` });
      await recordSentEmail({ briefId: id, to: email, category: 'questionnaire-received', ...mail, providerId });
      requestEmailSent = true;
      emailPatch.request_email_sent_at = new Date().toISOString();
      emailPatch.email_last_error = null;
    } catch (emailError) {
      console.error('Courriel de confirmation client non envoyé:', emailError.message);
      emailPatch.email_last_error = String(emailError.message || 'Erreur de messagerie').slice(0, 500);
    }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/briefs?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(emailPatch)
      });
    } catch (statusError) { console.error('État du courriel de confirmation non enregistré:', statusError.message); }
    try { waitUntil(generateBriefSite(id)); }
    catch (scheduleError) {
      console.error('Tâche IA asynchrone indisponible:', scheduleError.message);
      void generateBriefSite(id);
    }
    return respond(res, 202, { ok: true, reference: id, requestEmailSent, generation: 'pending' });
  } catch (error) {
    console.error('Enregistrement du brief impossible:', error.message);
    return respond(res, 500, { error: 'Votre demande n’a pas pu être enregistrée. Réessayez ou contactez JL Studio par e-mail.' });
  }
};
