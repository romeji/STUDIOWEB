const { waitUntil } = require('@vercel/functions');
const { json, requireAdmin, supabaseRequest } = require('../_lib/admin-auth');
const { generateBriefSite } = require('../_lib/ai-site-generation');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!await requireAdmin(req, res)) return;
  const briefId = String(req.body?.briefId || '');
  if (!UUID.test(briefId)) return json(res, 400, { error: 'Demande client invalide.' });
  try {
    const rows = await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}&ai_generation_status=eq.failed&select=id`);
    if (!rows?.length) return json(res, 409, { error: 'Cette génération n’est pas en échec ou a déjà été relancée.' });
    const updated = await supabaseRequest(`briefs?id=eq.${encodeURIComponent(briefId)}&ai_generation_status=eq.failed&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ai_generation_status: 'pending', ai_generation_error: null })
    });
    if (!updated?.length) return json(res, 409, { error: 'Cette génération est déjà en cours.' });
    waitUntil(generateBriefSite(briefId));
    return json(res, 202, { ok: true, generation: 'pending' });
  } catch (error) {
    console.error('Relance de génération impossible:', error.message);
    return json(res, 500, { error: 'La génération ne peut pas être relancée pour le moment.' });
  }
};
