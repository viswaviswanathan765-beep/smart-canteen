'use strict';

const RazorpayProvider = require('./RazorpayProvider');
const CashProvider = require('./CashProvider');

const providers = {
  RAZORPAY: new RazorpayProvider(),
  CASH: new CashProvider(),
};

/**
 * Get payment provider instance by name.
 * @param {string} providerName - 'RAZORPAY' | 'CASH'
 * @returns {import('./PaymentProvider')}
 */
function getProvider(providerName = 'RAZORPAY') {
  const p = providers[providerName.toUpperCase()];
  if (!p) {
    throw new Error(`Unsupported payment provider: ${providerName}`);
  }
  return p;
}

module.exports = { getProvider, RazorpayProvider, CashProvider };
