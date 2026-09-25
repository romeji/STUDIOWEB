const API_VERSION = '2026-08-26.dahlia';

const PLANS = {
  essentiel: { label: 'Essentiel', monthly: 4900, creation: 19900, pages: '1 page complète' },
  standard: { label: 'Standard', monthly: 8900, creation: 14900, pages: 'jusqu’à 3 pages' },
  complete: { label: 'Complète', monthly: 12900, creation: 9900, pages: '6 pages ou plus' }
};

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe n’est pas configuré sur Vercel.');
  const mode = String(process.env.STRIPE_MODE || 'test').toLowerCase();
  if (mode === 'test' && !/^(rk|sk)_test_/.test(key)) throw new Error('Le mode test attend une clé Stripe de test.');
  if (mode === 'live' && !/^(rk|sk)_live_/.test(key)) throw new Error('Le mode réel attend une clé Stripe live.');
  if (!['test', 'live'].includes(mode)) throw new Error('STRIPE_MODE doit valoir test ou live.');
  return key;
}

async function stripeRequest(path, { method = 'GET', params, idempotencyKey } = {}) {
  const key = stripeKey();
  const headers = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': API_VERSION
  };
  if (params) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers,
    body: params ? params.toString() : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = result.error?.message || `Stripe a refusé la requête (${response.status}).`;
    const error = new Error(reason);
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getOrCreateProduct(planKey, plan) {
  let startingAfter;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ active: 'true', limit: '100' });
    if (startingAfter) query.set('starting_after', startingAfter);
    const result = await stripeRequest(`products?${query}`);
    const found = result.data.find(item => item.metadata?.jl_studio_plan === planKey);
    if (found) return found;
    if (!result.has_more || !result.data.length) break;
    startingAfter = result.data[result.data.length - 1].id;
  }
  const params = new URLSearchParams({
    name: `JL Studio — ${plan.label}`,
    description: `Abonnement de création et d’hébergement d’un site vitrine (${plan.pages}).`,
    'metadata[jl_studio_plan]': planKey
  });
  return stripeRequest('products', {
    method: 'POST', params, idempotencyKey: `jl-studio-product-${planKey}-v1`
  });
}

async function getOrCreatePrice(planKey, productId, kind, amount) {
  const lookupKey = `jl_studio_${planKey}_${kind}_v1`;
  const query = new URLSearchParams();
  query.append('lookup_keys[]', lookupKey);
  query.set('active', 'true');
  query.set('limit', '1');
  const result = await stripeRequest(`prices?${query}`);
  const existing = result.data?.[0];
  if (existing && Number(existing.unit_amount) === amount && existing.currency === 'eur') return existing;

  const params = new URLSearchParams({
    product: productId,
    currency: 'eur',
    unit_amount: String(amount),
    lookup_key: lookupKey
  });
  if (kind === 'monthly') params.set('recurring[interval]', 'month');
  if (existing) params.set('transfer_lookup_key', 'true');
  return stripeRequest('prices', {
    method: 'POST', params,
    idempotencyKey: `jl-studio-price-${planKey}-${kind}-${amount}-v1`
  });
}

async function ensurePlanCatalog(planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error('La formule choisie ne correspond pas à une offre disponible.');
  const product = await getOrCreateProduct(planKey, plan);
  const [monthly, creation] = await Promise.all([
    getOrCreatePrice(planKey, product.id, 'monthly', plan.monthly),
    getOrCreatePrice(planKey, product.id, 'creation', plan.creation)
  ]);
  return { product, monthly, creation, plan };
}

module.exports = { API_VERSION, PLANS, stripeKey, stripeRequest, ensurePlanCatalog };
