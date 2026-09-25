const { domainToASCII } = require('url');

const recentChecks = new Map();
let bootstrapCache = { value: null, expiresAt: 0 };

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase();
  if (!value || value.length > 300 || /[\s/@?#]/.test(value)) return '';
  value = value.replace(/\.$/, '');
  const ascii = domainToASCII(value);
  if (!ascii || ascii.length > 253 || ascii.split('.').length < 2) return '';
  const labels = ascii.split('.');
  if (labels.some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return '';
  return ascii;
}

async function getBootstrap() {
  if (bootstrapCache.value && bootstrapCache.expiresAt > Date.now()) return bootstrapCache.value;
  const response = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error('Le répertoire RDAP est temporairement inaccessible.');
  const data = await response.json();
  if (!Array.isArray(data.services)) throw new Error('Répertoire RDAP invalide.');
  bootstrapCache = { value: data.services, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return data.services;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Méthode non autorisée.' });
  const domain = normalizeDomain(req.body?.domain);
  if (!domain) return respond(res, 400, { error: 'Saisissez un nom de domaine complet, par exemple mon-entreprise.fr.' });
  const ip = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const windowStart = Date.now() - 60 * 1000;
  const timestamps = (recentChecks.get(ip) || []).filter(timestamp => timestamp > windowStart);
  if (timestamps.length >= 20) return respond(res, 429, { error: 'Trop de vérifications en peu de temps. Réessayez dans une minute.' });
  timestamps.push(Date.now()); recentChecks.set(ip, timestamps);
  if (recentChecks.size > 2000) for (const [key, values] of recentChecks) if (!values.some(timestamp => timestamp > windowStart)) recentChecks.delete(key);
  try {
    const tld = domain.split('.').at(-1);
    const services = await getBootstrap();
    const entry = services.find(([tlds]) => tlds.some(value => String(value).toLowerCase() === tld));
    if (!entry?.[1]?.length) return respond(res, 422, { error: `Le registre RDAP de .${tld} ne permet pas cette vérification automatique.` });
    let lastStatus = 0;
    for (const base of entry[1]) {
      if (!String(base).startsWith('https://')) continue;
      try {
        const endpoint = `${String(base).replace(/\/+$/, '')}/domain/${encodeURIComponent(domain)}`;
        const result = await fetch(endpoint, { headers: { Accept: 'application/rdap+json, application/json' }, redirect: 'manual', signal: AbortSignal.timeout(7000) });
        lastStatus = result.status;
        if (result.status === 200) return respond(res, 200, { domain, availability: 'registered', available: false, message: 'Ce nom apparaît déjà enregistré dans le registre.' });
        if (result.status === 404) return respond(res, 200, { domain, availability: 'probably_available', available: true, message: 'Aucune fiche d’enregistrement trouvée. Le domaine paraît disponible, sous réserve de confirmation auprès du registrar.' });
        if (result.status !== 429 && result.status < 500) return respond(res, 200, { domain, availability: 'unknown', available: null, message: 'Le registre n’a pas permis de conclure. Réessayez ou vérifiez auprès d’un registrar.' });
      } catch {}
    }
    console.warn('RDAP unavailable for domain check:', domain, lastStatus);
    return respond(res, 503, { domain, availability: 'unknown', available: null, message: 'La vérification du registre est momentanément indisponible. Réessayez ou vérifiez auprès d’un registrar.' });
  } catch (error) {
    console.error('Domain availability check failed:', error.message);
    return respond(res, 503, { domain, availability: 'unknown', available: null, message: 'La vérification est momentanément indisponible. Réessayez plus tard.' });
  }
};
