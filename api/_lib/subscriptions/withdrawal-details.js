const { json, supabaseRequest } = require('../admin-auth');
const { readWithdrawalClientId } = require('../correction-links');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non autorisée.' });
  try {
    const clientId = readWithdrawalClientId(String(req.query?.token || ''));
    if (!clientId) return json(res, 404, { error: 'Lien invalide.' });
    const rows = await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&select=company_name,plan,customer_type,contract_started_at,started_at,withdrawal_requested_at,withdrawal_status`);
    const client = rows?.[0];
    if (!client || client.customer_type !== 'consumer') return json(res, 404, { error: 'Aucun contrat consommateur trouvé.' });
    const startedAt = client.contract_started_at || client.started_at;
    if (!startedAt || Date.now() > new Date(startedAt).getTime() + 14 * 86400000) return json(res, 410, { error: 'Le délai légal de rétractation est expiré.' });
    return json(res, 200, { ok: true, companyName: client.company_name, plan: client.plan, contractDate: startedAt, requested: Boolean(client.withdrawal_requested_at), status: client.withdrawal_status });
  } catch (error) {
    console.error('Informations de rétractation indisponibles:', error.message);
    return json(res, 503, { error: 'Impossible de charger les informations du contrat. Écrivez à contact@jlstudioweb.fr.' });
  }
};
