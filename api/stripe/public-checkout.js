const crypto = require('crypto');
const { json, supabaseRequest } = require('../_lib/admin-auth');
const { PLANS, stripeRequest, ensurePlanCatalog } = require('../_lib/stripe-billing');

const SITE_URL = 'https://studioweb-eta.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  const token = String(req.body?.token || '');
  const planKey = String(req.body?.plan || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return json(res, 404, { error: 'Ce lien de paiement est invalide ou expiré.' });
  if (!PLANS[planKey]) return json(res, 400, { error: 'Choisissez une formule disponible.' });
  if (!process.env.SUPABASE_SECRET_KEY) return json(res, 503, { error: 'La base de suivi n’est pas configurée.' });

  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const briefs = await supabaseRequest(`briefs?preview_token_hash=eq.${encodeURIComponent(hash)}&preview_expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,company_name,contact_name,contact_email,contact_phone,generated_site_html&limit=1`);
    const brief = briefs?.[0];
    if (!brief?.generated_site_html) return json(res, 404, { error: 'La maquette est introuvable ou son lien a expiré.' });
    const existing = await supabaseRequest(`clients?brief_id=eq.${encodeURIComponent(brief.id)}&select=id,subscription_status,provider_subscription_id,stripe_checkout_session_id&limit=1`);
    if (existing?.[0]?.subscription_status === 'active') return json(res, 409, { error: 'Un abonnement est déjà actif pour ce projet. Contactez JL Studio pour toute évolution.' });
    if (existing?.[0]?.stripe_checkout_session_id) {
      const previous = await stripeRequest(`checkout/sessions/${encodeURIComponent(existing[0].stripe_checkout_session_id)}`);
      if (previous.status === 'open' && previous.url && previous.metadata?.plan === planKey) return json(res, 200, { ok: true, url: previous.url, resumed: true });
      if (previous.status === 'open' && previous.metadata?.plan !== planKey) await stripeRequest(`checkout/sessions/${encodeURIComponent(previous.id)}/expire`, { method: 'POST', params: new URLSearchParams() });
      if (previous.status === 'complete') return json(res, 409, { error: 'Votre paiement est en cours de confirmation. Actualisez dans quelques instants ou contactez JL Studio.' });
    }
    if (existing?.[0]?.provider_subscription_id && existing[0].subscription_status !== 'canceled') return json(res, 409, { error: 'Un paiement ou un abonnement est déjà en cours pour ce projet. Reprenez votre paiement initial ou contactez JL Studio.' });

    const plan = PLANS[planKey];
    const clients = await supabaseRequest('clients?on_conflict=brief_id&select=id,subscription_status,provider_subscription_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        brief_id: brief.id, company_name: brief.company_name, contact_name: brief.contact_name || '',
        contact_email: brief.contact_email, contact_phone: brief.contact_phone || '', plan: plan.label,
        monthly_price_cents: plan.monthly, subscription_status: 'pending', provider: 'stripe'
      })
    });
    const client = clients?.[0];
    if (!client?.id) throw new Error('Impossible de préparer le dossier de paiement client.');
    if (client.subscription_status === 'active') return json(res, 409, { error: 'Un abonnement est déjà actif pour ce projet.' });

    const { monthly, creation } = await ensurePlanCatalog(planKey);
    const params = new URLSearchParams({
      mode: 'subscription', locale: 'fr', customer_email: brief.contact_email,
      client_reference_id: client.id,
      'line_items[0][price]': monthly.id, 'line_items[0][quantity]': '1',
      'line_items[1][price]': creation.id, 'line_items[1][quantity]': '1',
      'metadata[client_id]': client.id, 'metadata[brief_id]': brief.id, 'metadata[plan]': planKey,
      'subscription_data[metadata][client_id]': client.id,
      'subscription_data[metadata][brief_id]': brief.id,
      'subscription_data[metadata][plan]': planKey,
      success_url: `${SITE_URL}/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/paiement.html?token=${encodeURIComponent(token)}&annule=1`,
      billing_address_collection: 'auto', 'phone_number_collection[enabled]': 'true',
      payment_method_collection: 'always'
    });
    // Stripe Checkout presents methods enabled in the Stripe Dashboard that are compatible with this subscription and customer.
    const session = await stripeRequest('checkout/sessions', {
      method: 'POST', params,
      idempotencyKey: `jl-studio-public-${brief.id}-${planKey}-${new Date().toISOString().slice(0,10)}`
    });
    await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ stripe_checkout_session_id: session.id })
    });
    return json(res, 201, { ok: true, url: session.url, plan: plan.label, monthlyCents: plan.monthly, creationCents: plan.creation });
  } catch (error) {
    console.error('Checkout client impossible:', error.status || error.message);
    const status = error.status === 400 ? 400 : error.status === 401 || error.status === 403 ? 503 : 502;
    return json(res, status, { error: status === 502 ? 'Stripe n’a pas pu préparer le paiement. Réessayez ou contactez JL Studio.' : error.message });
  }
};
