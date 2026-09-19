'use strict';

const QRCode = require('qrcode');

/**
 * QRService — generates QR codes for orders and UPI payments.
 */

/**
 * Generate a QR code (data URL) for order verification.
 * The QR encodes a JSON payload that the admin scanner can parse.
 */
async function generateOrderQR(order) {
  const payload = JSON.stringify({
    orderId: order.id,
    orderNumber: order.order_number,
    token: order.token_number,
    total: order.total,
    ts: Date.now(),
  });

  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' },
    width: 300,
  });

  return qrDataUrl;
}

/**
 * Generate a UPI payment QR code.
 * UPI deep-link format: upi://pay?pa=VPA&pn=NAME&am=AMOUNT&cu=INR&tn=NOTE
 */
async function generateUPIQR({ vpa, payeeName, amount, orderNumber }) {
  const upiVpa = vpa || 'canteen@upi';
  const upiLink = `upi://pay?pa=${upiVpa}&pn=${encodeURIComponent(payeeName || 'Smart Canteen')}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Order ${orderNumber}`)}`;

  const qrDataUrl = await QRCode.toDataURL(upiLink, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#4f46e5', light: '#ffffff' },
    width: 280,
  });

  return { qrDataUrl, upiLink };
}

module.exports = { generateOrderQR, generateUPIQR };
