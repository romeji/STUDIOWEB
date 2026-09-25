const crypto = require('crypto');
const { supabaseRequest } = require('../_lib/admin-auth');

function page(res, status, title, message) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox");
  return res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui;padding:32px;color:#28243a"><h1>${title}</h1><p>${message}</p></body></html>`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') return page(res, 405, 'Méthode non autorisée', '');
  const token = String(req.query?.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return page(res, 404, 'Aperçu indisponible', 'Vérifiez le lien reçu par e-mail ou contactez JL Studio.');
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await supabaseRequest(`briefs?preview_token_hash=eq.${encodeURIComponent(hash)}&preview_expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=generated_site_html&limit=1`);
    const html = rows?.[0]?.generated_site_html;
    if (!html) return page(res, 404, 'Aperçu indisponible ou expiré', 'Contactez JL Studio pour recevoir un nouvel aperçu.');
    // Sandboxed at the embedding iframe; this listener only discourages casual saving.
    const deterrent = `<script>addEventListener('contextmenu',e=>e.preventDefault());addEventListener('keydown',e=>{if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&['I','J','C'].includes(e.key.toUpperCase()))||(e.ctrlKey&&e.key.toLowerCase()==='u'))e.preventDefault()});</script>`;
    const output = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${deterrent}</head>`) : `${deterrent}${html}`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src https: blob: 'unsafe-inline'; style-src https: 'unsafe-inline'; img-src https: data: blob:; font-src https: data:; media-src https: data: blob:; frame-src https:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return res.status(200).send(output);
  } catch (error) {
    console.error('Lecture de la maquette impossible:', error.message);
    return page(res, 503, 'Aperçu momentanément indisponible', 'Réessayez dans quelques instants.');
  }
};
