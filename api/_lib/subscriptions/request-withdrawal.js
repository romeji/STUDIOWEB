const { json, supabaseRequest } = require('../admin-auth');
const { stripeRequest } = require('../stripe-billing');
const { readWithdrawalClientId } = require('../correction-links');
const { sendTransactionalEmail, withdrawalAcknowledgementEmail, withdrawalAdminEmail, recordSentEmail } = require('../transactional-email');

const DAY = 24 * 60 * 60 * 1000;
function isWithinWindow(startedAt) {
  const start = new Date(startedAt).getTime();
  return Number.isFinite(start) && Date.now() <= start + 14 * DAY;
}

async function invoicePaymentIntents(invoiceId) {
  const result = await stripeRequest(`invoice_payments?invoice=${encodeURIComponent(invoiceId)}&status=paid&limit=100`);
  return (result.data || []).map(row => {
    const payment = row.payment || {};
    const intent = payment.payment_intent || payment.payment_intent_id || payment.paymentIntent;
    return typeof intent === 'string' ? intent : intent?.id;
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SECRET_KEY || !process.env.RESEND_API_KEY) return json(res, 503, { error: 'Le formulaire de rétractation est momentanément indisponible. Écrivez à contact@jlstudioweb.fr.' });
  try {
    const token = String(req.body?.token || '');
    const fullName = String(req.body?.fullName || '').trim().slice(0, 160);
    const declaration = req.body?.confirmWithdrawal === true;
    const clientId = readWithdrawalClientId(token);
    if (!clientId) return json(res, 400, { error: 'Le lien de rétractation est invalide. Demandez un nouveau lien par e-mail.' });
    if (!fullName || !declaration) return json(res, 400, { error: 'Indiquez votre nom et confirmez explicitement votre demande de rétractation.' });
    const rows = await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,brief_id,company_name,contact_name,contact_email,plan,customer_type,provider,provider_subscription_id,subscription_status,contract_started_at,started_at,early_start_requested,withdrawal_requested_at,withdrawal_status,withdrawal_refund_id`);
    const client = rows?.[0];
    if (!client || client.customer_type !== 'consumer') return json(res, 404, { error: 'Aucun contrat consommateur correspondant à ce lien n’a été trouvé.' });
    const contractStart = client.contract_started_at || client.started_at;
    if (!contractStart || !isWithinWindow(contractStart)) return json(res, 410, { error: 'Le délai de rétractation en ligne de 14 jours est expiré. Pour toute autre demande, utilisez la page de résiliation ou contactez JL Studio.' });
    if (client.withdrawal_status && !['pending', 'refund_review'].includes(client.withdrawal_status)) return json(res, 200, { ok: true, alreadyRequested: true, status: client.withdrawal_status });
    if (client.withdrawal_requested_at && client.withdrawal_status !== 'pending') return json(res, 200, { ok: true, alreadyRequested: true, status: client.withdrawal_status });

    const requestedAt = new Date().toISOString();
    const exactDeclaration = `Je soussigné(e) ${fullName}, demande expressément la rétractation du contrat JL Studio Web relatif au site « ${client.company_name} », conclu le ${new Date(contractStart).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Déclaration envoyée le ${new Date(requestedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} depuis le formulaire en ligne.`;
    let resultStatus = 'refund_review';
    await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ withdrawal_requested_at: requestedAt, withdrawal_status: 'pending', withdrawal_declaration: exactDeclaration }) });

    let reviewReason = '';
    if (client.provider === 'stripe' && client.provider_subscription_id) {
      const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(client.provider_subscription_id)}`);
      if (!['canceled', 'incomplete_expired'].includes(subscription.status)) await stripeRequest(`subscriptions/${encodeURIComponent(subscription.id)}`, { method: 'DELETE', params: new URLSearchParams(), idempotencyKey: `jl-withdraw-sub-${client.id}` });
      if (client.early_start_requested) {
        reviewReason = 'Le client avait demandé le commencement anticipé de la prestation. Calculer et documenter le montant proportionnel correspondant au service réellement exécuté avant d’effectuer le remboursement.';
      } else {
        const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id;
        if (!invoiceId) reviewReason = 'Facture initiale Stripe absente : vérifier le paiement et le remboursement.';
        else {
          const intents = await invoicePaymentIntents(invoiceId);
          if (!intents.length) reviewReason = 'Aucun paiement carte remboursable trouvé dans la facture initiale. Vérifier le paiement et traiter manuellement si nécessaire.';
          else {
            const refunds = [];
            for (const intentId of intents) refunds.push(await stripeRequest('refunds', { method: 'POST', params: new URLSearchParams({ payment_intent: intentId, reason: 'requested_by_customer' }), idempotencyKey: `jl-withdraw-refund-${client.id}-${intentId}` }));
            const refundId = refunds.map(item => item.id).join(',');
            const refundCents = refunds.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
            const complete = refunds.every(item => item.status === 'succeeded');
            resultStatus = complete ? 'refunded' : 'refund_processing';
            await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ withdrawal_refund_id: refundId, withdrawal_refund_cents: refundCents, withdrawal_status: complete ? 'refunded' : 'refund_processing', subscription_status: 'canceled' }) });
          }
        }
      }
    } else reviewReason = 'Aucun abonnement Stripe relié à ce dossier : vérifier et traiter le remboursement manuellement.';

    const status = reviewReason ? 'refund_review' : client.early_start_requested ? 'refund_review' : undefined;
    if (reviewReason) { resultStatus = 'refund_review'; await supabaseRequest(`clients?id=eq.${encodeURIComponent(client.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ withdrawal_status: 'refund_review', subscription_status: 'canceled' }) }); }
    else if (status) resultStatus = status;
    const receipt = withdrawalAcknowledgementEmail(client, fullName, requestedAt, resultStatus);
    const receiptId = await sendTransactionalEmail({ to: client.contact_email, ...receipt, idempotencyKey: `withdrawal-receipt-${client.id}-${requestedAt}` });
    await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: client.contact_email, category: 'consumer-withdrawal', ...receipt, providerId: receiptId });
    const adminMail = withdrawalAdminEmail(client, fullName, requestedAt, resultStatus, reviewReason, exactDeclaration);
    const adminId = await sendTransactionalEmail({ to: 'lopes.jerome21@gmail.com', ...adminMail, replyTo: client.contact_email, idempotencyKey: `withdrawal-admin-${client.id}-${requestedAt}` });
    await recordSentEmail({ briefId: client.brief_id, clientId: client.id, to: 'lopes.jerome21@gmail.com', category: 'consumer-withdrawal-admin', ...adminMail, providerId: adminId });
    return json(res, 200, { ok: true, status: resultStatus, message: resultStatus === 'refunded' ? 'Votre demande est enregistrée. L’abonnement est arrêté et le remboursement du premier règlement a été demandé à Stripe.' : 'Votre demande est enregistrée et l’abonnement est arrêté. JL Studio vérifie le montant à rembourser et vous confirme la suite par e-mail.' });
  } catch (error) {
    console.error('Demande de rétractation non traitée:', error.message);
    return json(res, error.status === 400 ? 400 : 502, { error: 'La demande est en cours de vérification mais n’a pas pu être finalisée automatiquement. Écrivez à contact@jlstudioweb.fr ; votre déclaration doit être conservée.' });
  }
};
