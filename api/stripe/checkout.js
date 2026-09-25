const { json, requireAdmin, supabaseRequest } = require('../_lib/admin-auth');
const { PLANS, stripeRequest, ensurePlanCatalog } = require('../_lib/stripe-billing');

const SITE_URL = 'https://studioweb-eta.vercel.app';

function normalizePlan(value) {
  const name = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (name.includes('essentiel')) return 'essentiel';
  if (name.includes('standard')) return 'standard';
  if (name.includes('complete')) return 'complete';
  return name;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!await requireAdmin(req, res)) return;
  if (!process.env.SUPABASE_SECRET_KEY) return json(res, 503, { error: 'La connexion sécurisée à Supabase manque sur Vercel.' });

  const clientId = String(req.body?.clientId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    return json(res, 400, { error: 'Fiche client invalide.' });
  }

  try {
    const rows = await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,company_name,contact_name,contact_email,plan,subscription_status,provider,provider_subscription_id`);
    const client = rows?.[0];
    if (!client) return json(res, 404, { error: 'Client introuvable.' });
    if (client.subscription_status === 'active') return json(res, 409, { error: 'Cette fiche a déjà un abonnement actif.' });
    if (client.provider === 'stripe' && client.provider_subscription_id && client.subscription_status !== 'canceled') {
      return json(res, 409, { error: 'Un abonnement Stripe existe déjà pour cette fiche. Évitez de créer un second abonnement.' });
    }
    if (!client.contact_email) return json(res, 400, { error: 'Ajoutez une adresse e-mail au client avant de créer le lien.' });

    const planKey = normalizePlan(client.plan);
    if (!PLANS[planKey]) return json(res, 400, { error: 'Choisissez une formule Essentiel, Standard ou Complète dans la fiche client.' });
    const { monthly, creation, plan } = await ensurePlanCatalog(planKey);

    const params = new URLSearchParams({
      mode: 'subscription',
      customer_email: client.contact_email,
      client_reference_id: client.id,
      'line_items[0][price]': monthly.id,
      'line_items[0][quantity]': '1',
      'line_items[1][price]': creation.id,
      'line_items[1][quantity]': '1',
      'metadata[client_id]': client.id,
      'metadata[plan]': planKey,
      'subscription_data[metadata][client_id]': client.id,
      'subscription_data[metadata][plan]': planKey,
      success_url: `${SITE_URL}/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/paiement-annule`,
      'billing_address_collection': 'auto',
      'phone_number_collection[enabled]': 'true'
    });
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const suffix = Array.from({ length: 8 }, () => alphabet[require('crypto').randomInt(alphabet.length)]).join('');
    const tracking = `jlstudio_${suffix}`;
    params.set('integration_identifier', tracking);
    const session = await stripeRequest('checkout/sessions', {
      method: 'POST', params,
      idempotencyKey: `jl-studio-checkout-${client.id}-${Date.now()}`
    });
    return json(res, 201, {
      ok: true,
      url: session.url,
      expiresAt: session.expires_at,
      plan: plan.label,
      monthlyCents: plan.monthly,
      creationCents: plan.creation
    });
  } catch (error) {
    console.error('Création de la session Stripe impossible:', error.status || 'erreur réseau');
    const status = error.status === 400 ? 400 : error.status === 401 || error.status === 403 ? 503 : 502;
    return json(res, status, { error: status === 502 ? 'Stripe n’a pas pu préparer le paiement. Vérifiez sa configuration puis réessayez.' : error.message });
  }
};
