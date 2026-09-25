const crypto = require('crypto');
const { json, requireAdmin, supabaseRequest } = require('../_lib/admin-auth');
const { sendTransactionalEmail, previewReadyEmail } = require('../_lib/transactional-email');

const SITE_URL = 'https://studioweb-eta.vercel.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!await requireAdmin(req, res)) return;
  const briefId = String(req.body?.briefId || '');
  const siteHtml = typeof req.body?.siteHtml === 'string' ? req.body.siteHtml : '';
  if (!UUID.test(briefId)) return json(res, 400, { error: 'Demande client invalide.' });
  if (siteHtml && Buffer.byteLength(siteHtml, 'utf8') > 1_800_000) return json(res, 413, { error: 'Le site généré dépasse la taille maximale de 1,8 Mo.' });
  if (siteHtml && !/<html[\s>]/i.test(siteHtml)) return json(res, 400, { error: 'Collez le document HTML complet généré pour ce client.' });

  try {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const existing = await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}&select=id,company_name,contact_name,contact_email,generated_site_html`);
    if (!existing?.length) return json(res, 404, { error: 'Demande introuvable.' });
    if (!siteHtml && !existing[0].generated_site_html) return json(res, 400, { error: 'Collez d’abord le HTML complet du site généré.' });
    const update = { preview_token_hash: tokenHash, preview_expires_at: expiresAt, preview_email_sent_at: null, email_last_error: null, status: 'apercu_envoye' };
    if (siteHtml) update.generated_site_html = siteHtml;
    const saved = await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update)
    });
    if (!saved?.length) return json(res, 500, { error: 'La maquette n’a pas pu être enregistrée.' });
    const url = `${SITE_URL}/maquette.html?token=${encodeURIComponent(token)}`;
    let previewEmailSent = false;
    let emailError = '';
    let emailFailure = '';
    try {
      await sendTransactionalEmail({ to: existing[0].contact_email, ...previewReadyEmail(existing[0], url, expiresAt), idempotencyKey: `preview-ready-${tokenHash}` });
      previewEmailSent = true;
    } catch (error) {
      emailError = 'Le lien est créé, mais le courriel automatique n’a pas été envoyé. Vérifiez la configuration Resend et réessayez.';
      emailFailure = String(error.message || 'Erreur de messagerie').slice(0, 500);
      console.error('Courriel d’aperçu non envoyé:', error.message);
    }
    if (previewEmailSent) {
      try { await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ preview_email_sent_at: new Date().toISOString(), email_last_error: null })
      }); } catch (statusError) { console.error('État du courriel aperçu non enregistré:', statusError.message); }
    } else {
      try {
        await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ email_last_error: emailFailure })
        });
      } catch (statusError) { console.error('État du courriel aperçu non enregistré:', statusError.message); }
    }
    return json(res, 200, { ok: true, url, expiresAt, previewEmailSent, emailError });
  } catch (error) {
    console.error('Enregistrement aperçu impossible:', error.message);
    return json(res, 500, { error: 'La maquette ou le lien privé n’a pas pu être enregistré. Vérifiez la migration Supabase.' });
  }
};
