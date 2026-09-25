const MAX_TOTAL_IMAGE_BYTES = 2_500_000;
const MAX_IMAGE_BYTES = 500_000;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const crypto = require('node:crypto');
const { sendTransactionalEmail, receivedEmail, recordSentEmail } = require('./_lib/transactional-email');
const { requireAdmin } = require('./_lib/admin-auth');

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Méthode non autorisée.' });
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return respond(res, 503, { error: 'Le stockage des demandes Supabase n’est pas encore configuré.' });
  let emailReservation = null;
  const uploadedPhotoPaths = [];

  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    if (payload.action === 'retry-generation') {
      if (!(await requireAdmin(req, res))) return;
      return respond(res, 410, { error: 'La génération automatique payante est désactivée. Copiez le prompt depuis le tableau de bord et utilisez votre session ChatGPT, puis collez le HTML ici.' });
    }
    if (payload.website) return respond(res, 200, { ok: true });
    const answers = payload.answers;
    if (!answers || typeof answers !== 'object' || !answers.user_email || !answers.company_name || payload.consent !== true) {
      return respond(res, 400, { error: 'Les champs obligatoires ou le consentement sont manquants.' });
    }
    if (!Array.isArray(payload.photos) || payload.photos.length > 6) return respond(res, 400, { error: 'Six images maximum sont acceptées.' });
    const email = String(answers.user_email).trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(res, 400, { error: 'Adresse e-mail invalide.' });
    const forwarded = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const ipHash = crypto.createHash('sha256').update(`${SUPABASE_SECRET_KEY}:${forwarded}`).digest('hex');
    const rate = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_brief_submission`, {
      method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ip_hash: ipHash })
    });
    if (!rate.ok) throw new Error(`La limite anti-abus Supabase n’est pas configurée (${rate.status}).`);
    if (await rate.json() !== true) return respond(res, 429, { error: 'Trop de demandes ont été envoyées depuis cette connexion. Réessayez un peu plus tard.' });
    const id = crypto.randomUUID();
    let totalBytes = 0;
    const validatedPhotos = [];
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
      validatedPhotos.push({ buffer, type: photo.type, ext, index });
    }

    const emailHash = crypto.createHmac('sha256', SUPABASE_SECRET_KEY).update(email.toLowerCase()).digest('hex');
    const reservation = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_brief_email_demo`, {
      method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email_hash: emailHash, p_brief_id: id })
    });
    if (!reservation.ok) throw new Error(`La protection anti-doublon Supabase n’est pas disponible (${reservation.status}).`);
    if (await reservation.json() !== true) {
      return respond(res, 409, {
        code: 'demo_recently_requested',
        error: 'Une maquette a déjà été demandée avec cette adresse e-mail au cours des 30 derniers jours. Vérifiez vos courriers indésirables ou contactez-moi si vous avez besoin de retrouver votre lien.'
      });
    }
    emailReservation = { emailHash, briefId: id };

    const photoPaths = [];
    for (const photo of validatedPhotos) {
      const path = `${id}/${photo.index + 1}.${photo.ext}`;
      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/brief-photos/${path}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': photo.type, 'x-upsert': 'false' },
        body: photo.buffer
      });
      if (!upload.ok) throw new Error(`Supabase Storage a refusé l’image (${upload.status}).`);
      photoPaths.push(path);
      uploadedPhotoPaths.push(path);
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
    const finalized = await fetch(`${SUPABASE_URL}/rest/v1/rpc/finalize_brief_email_demo`, {
      method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email_hash: emailHash, p_brief_id: id })
    });
    if (!finalized.ok || await finalized.json() !== true) {
      await fetch(`${SUPABASE_URL}/rest/v1/briefs?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { apikey: SUPABASE_SECRET_KEY, Prefer: 'return=minimal' }
      }).catch(() => {});
      throw new Error(`La réservation anti-doublon n’a pas pu être finalisée (${finalized.status}).`);
    }
    emailReservation = null;
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
    return respond(res, 202, { ok: true, reference: id, requestEmailSent, generation: 'manual' });
  } catch (error) {
    if (emailReservation) {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/release_brief_email_demo`, {
        method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email_hash: emailReservation.emailHash, p_brief_id: emailReservation.briefId })
      }).catch(() => {});
      await Promise.all(uploadedPhotoPaths.map(path => fetch(`${SUPABASE_URL}/storage/v1/object/brief-photos/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'DELETE', headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` }
      }).catch(() => {})));
    }
    console.error('Enregistrement du brief impossible:', error.message);
    return respond(res, 500, { error: 'Votre demande n’a pas pu être enregistrée. Réessayez ou contactez JL Studio par e-mail.' });
  }
};
