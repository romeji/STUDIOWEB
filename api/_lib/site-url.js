'use strict';

// Canonical production origin. Do not trust the incoming Host header when building
// customer-facing links, Stripe return URLs, or authentication redirects.
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://jlstudioweb.fr').replace(/\/+$/, '');

module.exports = { SITE_URL };
