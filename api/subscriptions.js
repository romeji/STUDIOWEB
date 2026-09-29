const handlers = {
  cancel: require('./_lib/subscriptions/cancel'),
  'request-cancel': require('./_lib/subscriptions/request-cancel'),
  'send-cancel-link': require('./_lib/subscriptions/send-cancel-link'),
  'request-withdrawal': require('./_lib/subscriptions/request-withdrawal'),
  'send-withdrawal-link': require('./_lib/subscriptions/send-withdrawal-link'),
  'withdrawal-details': require('./_lib/subscriptions/withdrawal-details')
};

module.exports = function handler(req, res) {
  const action = String(req.query?.action || '').trim();
  const selected = handlers[action];
  if (!selected) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(404).json({ error: 'Cette action abonnement est introuvable.' });
  }
  return selected(req, res);
};
