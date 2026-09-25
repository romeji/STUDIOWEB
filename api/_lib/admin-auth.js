const ADMIN_EMAIL = 'lopes.jerome21@gmail.com';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

async function requireAdmin(req, res) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    json(res, 503, { error: 'La connexion Supabase n’est pas configurée.' });
    return false;
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    json(res, 401, { error: 'Connexion administrateur requise.' });
    return false;
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      json(res, 401, { error: 'Session expirée. Reconnectez-vous.' });
      return false;
    }
    const user = await response.json();
    if (String(user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      json(res, 403, { error: 'Accès refusé.' });
      return false;
    }
    return true;
  } catch {
    json(res, 502, { error: 'Vérification de la session impossible.' });
    return false;
  }
}

async function supabaseRequest(path, options = {}) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('La base Supabase n’est pas configurée côté serveur.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase a refusé la mise à jour (${response.status}).`);
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

module.exports = { json, requireAdmin, supabaseRequest };
