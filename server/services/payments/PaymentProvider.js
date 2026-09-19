'use strict';

/**
 * PaymentProvider — Abstract base interface for payment gateways.
 * Allows switching between Razorpay, Cash, UPI, Stripe, etc. without modifying OrderService.
 */
class PaymentProvider {
  constructor(name) {
    if (new.target === PaymentProvider) {
      throw new TypeError('Cannot construct PaymentProvider instances directly');
    }
    this.name = name;
  }

  /**
   * Create an order on the payment gateway.
   * @param {object} params
   * @param {number} params.orderId - Internal order ID
   * @param {string} params.orderNumber - Internal order number (e.g. O-001)
   * @param {number} params.amountPaise - Amount in integer minor units (paise)
   * @param {string} [params.currency='INR']
   * @param {object} [params.notes]
   * @returns {Promise<{ success: boolean, providerOrderId: string, amountPaise: number, currency: string }>}
   */
  async createPaymentOrder(params) {
    throw new Error('createPaymentOrder() must be implemented');
  }

  /**
   * Verify signature returned by frontend checkout callback.
   * @param {object} params
   * @param {string} params.providerOrderId
   * @param {string} params.providerPaymentId
   * @param {string} params.signature
   * @returns {Promise<{ valid: boolean, error?: string }>}
   */
  async verifyPaymentSignature(params) {
    throw new Error('verifyPaymentSignature() must be implemented');
  }

  /**
   * Verify and parse webhook events from the payment gateway.
   * @param {string} rawBody - Unmodified raw string body
   * @param {string} signature - Header signature
   * @returns {Promise<{ valid: boolean, event?: object, error?: string }>}
   */
  async verifyWebhookSignature(rawBody, signature) {
    throw new Error('verifyWebhookSignature() must be implemented');
  }

  /**
   * Process refund for a payment.
   * @param {object} params
   * @param {string} params.providerPaymentId
   * @param {number} params.amountPaise
   * @param {string} [params.reason]
   * @returns {Promise<{ success: boolean, refundId?: string, error?: string }>}
   */
  async refundPayment(params) {
    throw new Error('refundPayment() must be implemented');
  }
}

module.exports = PaymentProvider;
