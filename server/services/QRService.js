'use strict';

const QRCode = require('qrcode');
const crypto = require('crypto');
const { getDb } = require('../db');

/**
 * QRService — Cryptographic QR tokens, generation, and atomic redemption.
 * Complies with single-use atomic collection and security specifications.
 */

/**
 * Generate a cryptographically secure token and QR data URL for an order.
 * Stored in qr_tokens with SHA-256 hash.
 *
 * @param {object} order
 * @returns {Promise<{ qrDataUrl: string, rawToken: string, tokenHash: string }>}
 */
async function generateOrderQR(order) {
  const db = getDb();

  // 1. Generate 256-bit random cryptographic token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 2. Insert into qr_tokens table
  db.prepare(`
    INSERT INTO qr_tokens (order_id, token_hash, status, created_at, expires_at)
    VALUES (?, ?, 'ACTIVE', datetime('now'), datetime('now', '+24 hours'))
  `).run(order.id, tokenHash);

  // 3. Payload inside QR (safe reference, no secrets)
  const qrPayload = JSON.stringify({
    orderId: order.id,
    orderNumber: order.order_number,
    tokenNumber: order.token_number || null,
    token: rawToken,
  });

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: '#111827', light: '#ffffff' },
    width: 320,
  });

  return { qrDataUrl, rawToken, tokenHash };
}

/**
 * Verify and atomically redeem a QR token for food handover.
 * Protects against duplicate scans using atomic database updates.
 *
 * @param {string} rawTokenOrHash - Raw token or full hash
 * @param {number} adminId - Admin/staff user ID
 * @returns {{ success: boolean, message?: string, order?: object, code?: string }}
 */
function verifyAndRedeemQR(rawTokenOrHash, adminId) {
  const db = getDb();

  if (!rawTokenOrHash) {
    return { success: false, code: 'QR_INVALID', message: 'Token parameter is required' };
  }

  // Look up directly by hash, or compute sha256 of raw token
  let qrRecord = db.prepare('SELECT * FROM qr_tokens WHERE token_hash = ?').get(rawTokenOrHash);
  if (!qrRecord) {
    const computedHash = crypto.createHash('sha256').update(rawTokenOrHash).digest('hex');
    qrRecord = db.prepare('SELECT * FROM qr_tokens WHERE token_hash = ?').get(computedHash);
  }

  if (!qrRecord) {
    return { success: false, code: 'QR_INVALID', message: 'Invalid or unknown QR code' };
  }

  const order = db.prepare(`
    SELECT o.*, u.name as admin_name FROM orders o
    LEFT JOIN users u ON u.id = o.created_by_admin_id
    WHERE o.id = ?
  `).get(qrRecord.order_id);

  if (!order) {
    return { success: false, code: 'ORDER_NOT_FOUND', message: 'Associated order not found' };
  }

  if (order.status === 'CANCELLED') {
    return { success: false, code: 'ORDER_CANCELLED', message: 'Order was cancelled and cannot be fulfilled' };
  }

  if (order.payment_status !== 'PAID') {
    return {
      success: false,
      code: 'PAYMENT_NOT_CONFIRMED',
      message: `Payment status is ${order.payment_status}. Food cannot be handed over until paid.`,
    };
  }

  // ATOMIC CHECK & REDEMPTION
  if (qrRecord.status === 'USED' || order.status === 'COMPLETED') {
    return {
      success: false,
      code: 'ORDER_ALREADY_COLLECTED',
      message: `Food already collected at ${qrRecord.used_at || 'earlier time'}`,
      order,
    };
  }

  const redeemTx = db.transaction(() => {
    // Atomic update: only succeeds if still ACTIVE
    const res = db.prepare(`
      UPDATE qr_tokens
      SET status = 'USED', used_at = datetime('now'), used_by_admin_id = ?
      WHERE id = ? AND status = 'ACTIVE'
    `).run(adminId, qrRecord.id);

    if (res.changes === 0) {
      throw new Error('CONCURRENCY_ERROR: Already collected by another cashier');
    }

    db.prepare(`
      UPDATE orders
      SET status = 'COMPLETED', updated_at = datetime('now')
      WHERE id = ?
    `).run(order.id);

    return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  });

  try {
    const updatedOrder = redeemTx();
    updatedOrder.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    return {
      success: true,
      message: 'Order verified and collected successfully! Food handed over.',
      order: updatedOrder,
    };
  } catch (err) {
    return {
      success: false,
      code: 'ORDER_ALREADY_COLLECTED',
      message: 'Order was just collected by another cashier',
      order,
    };
  }
}

/**
 * Generate UPI deep-link QR code.
 */
async function generateUPIQR({ vpa, payeeName, amountPaise, orderNumber }) {
  const upiVpa = vpa || process.env.CANTEEN_UPI_VPA || 'canteen@upi';
  const amountRupees = (amountPaise / 100).toFixed(2);
  const upiLink = `upi://pay?pa=${upiVpa}&pn=${encodeURIComponent(payeeName || 'Smart Canteen')}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(`Order ${orderNumber}`)}`;

  const qrDataUrl = await QRCode.toDataURL(upiLink, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#4f46e5', light: '#ffffff' },
    width: 280,
  });

  return { qrDataUrl, upiLink };
}

module.exports = {
  generateOrderQR,
  verifyAndRedeemQR,
  generateUPIQR,
};
