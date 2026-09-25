const { sendTransactionalEmail, briefAdminEmail, recordSentEmail } = require('./transactional-email');

const ADMIN_EMAIL = 'lopes.jerome21@gmail.com';

async function sendBriefNotification(brief, photos = []) {
  const mail = briefAdminEmail(brief);
  const attachments = photos.map((photo, index) => ({
    filename: `photo-${index + 1}.${photo.ext}`,
    content: photo.buffer.toString('base64'),
    content_type: photo.type
  }));
  const providerId = await sendTransactionalEmail({
    to: ADMIN_EMAIL,
    replyTo: brief.contact_email,
    ...mail,
    attachments,
    idempotencyKey: `brief-admin-${brief.id}`
  });
  await recordSentEmail({ briefId: brief.id, to: ADMIN_EMAIL, category: 'new-brief-admin', ...mail, providerId });
  return providerId;
}

async function loadBriefPhotos(brief) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  const files = [];
  for (const path of Array.isArray(brief.photo_paths) ? brief.photo_paths : []) {
    if (typeof path !== 'string' || !path.startsWith(`${brief.id}/`)) throw new Error('Chemin de photo invalide.');
    const name = path.split('/').at(-1);
    const match = /^(\d+)\.(jpg|png|webp)$/i.exec(name || '');
    if (!match) throw new Error('Format de photo enregistré invalide.');
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/brief-photos/${path.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` }
    });
    if (!response.ok) throw new Error(`Impossible de récupérer une photo du formulaire (${response.status}).`);
    const ext = match[2].toLowerCase();
    files.push({ buffer: Buffer.from(await response.arrayBuffer()), ext, type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` });
  }
  return files;
}

module.exports = { sendBriefNotification, loadBriefPhotos };
