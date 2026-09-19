'use strict';

const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');

/**
 * CashProvider — Provider for counter cash transactions.
 */
class CashProvider extends PaymentProvider {
  constructor() {
    super('CASH');
  }

  async createPaymentOrder({ orderId, orderNumber, amountPaise }) {
    return {
      success: true,
      providerOrderId: `cash_${orderNumber || orderId}_${Date.now()}`,
      amountPaise,
      currency: 'INR',
    };
  }

  async verifyPaymentSignature() {
    return { valid: true };
  }

  async verifyWebhookSignature() {
    return { valid: false, error: 'Cash does not support webhooks' };
  }

  async refundPayment({ amountPaise, reason }) {
    return {
      success: true,
      refundId: `cash_rfnd_${Date.now()}`,
    };
  }
}

module.exports = CashProvider;
