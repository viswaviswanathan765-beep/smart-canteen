'use strict';

const { getDb } = require('../db');
const { generateUPIQR } = require('./QRService');

/**
 * PaymentService — handles cash and UPI payment flows.
 * Records full audit trail in the payments table.
 */

/**
 * Record a cash payment and mark the order as PAID.
 *
 * @param {number} orderId
 * @param {number} amountReceived
 * @param {number} cashierId
 * @returns {{ success: bool, change: number, payment: object } | { success: false, message }}
 */
function processCashPayment(orderId, amountReceived, cashierId) {
  const db = getDb();

  const order = db.prepare('SELECT id, total, payment_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  if (order.payment_status === 'PAID') return { success: false, message: 'Order already paid' };

  if (amountReceived < order.total) {
    return {
      success: false,
      message: `Insufficient amount. Total is ₹${order.total}. Received only ₹${amountReceived}.`
    };
  }

  const change = parseFloat((amountReceived - order.total).toFixed(2));

  const process = db.transaction(() => {
    // Insert payment record
    const result = db.prepare(`
      INSERT INTO payments (order_id, method, amount_due, amount_received, change_amount, cashier_id, status)
      VALUES (?, 'CASH', ?, ?, ?, ?, 'PAID')
    `).run(orderId, order.total, amountReceived, change, cashierId);

    // Mark order as PAID and set status to PREPARING
    db.prepare(`
      UPDATE orders SET payment_status = 'PAID', status = 'PREPARING', updated_at = datetime('now')
      WHERE id = ? AND payment_status != 'PAID'
    `).run(orderId);

    return db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid);
  });

  const payment = process();
  return { success: true, change, payment };
}

/**
 * Generate a UPI payment QR for an order.
 */
async function generateUPIPayment(orderId) {
  const db = getDb();
  const order = db.prepare('SELECT id, order_number, total, payment_status FROM orders WHERE id = ?').get(orderId);

  if (!order) return { success: false, message: 'Order not found' };
  if (order.payment_status === 'PAID') return { success: false, message: 'Already paid' };

  const { qrDataUrl, upiLink } = await generateUPIQR({
    amount: order.total,
    orderNumber: order.order_number,
  });

  // Create a pending payment record
  const existing = db.prepare('SELECT id FROM payments WHERE order_id = ? AND method = ? AND status = ?')
    .get(orderId, 'UPI', 'PENDING');

  if (!existing) {
    db.prepare(`
      INSERT INTO payments (order_id, method, amount_due, upi_qr_data, status)
      VALUES (?, 'UPI', ?, ?, 'PENDING')
    `).run(orderId, order.total, upiLink);
  }

  return { success: true, qrDataUrl, upiLink, amount: order.total };
}

/**
 * Verify a UPI payment (production: integrate with payment gateway webhook).
 * In this implementation: admin manually confirms after visual verification.
 * In production: replace this with actual gateway verification.
 */
function verifyUPIPayment(orderId, transactionRef, adminId) {
  const db = getDb();

  const order = db.prepare('SELECT id, total, payment_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  if (order.payment_status === 'PAID') return { success: false, message: 'Already paid' };

  // TODO (production): Call payment gateway API to verify transactionRef
  // const verified = await razorpayClient.verifyPayment(transactionRef);
  // if (!verified) return { success: false, message: 'Payment not verified by gateway' };

  const process = db.transaction(() => {
    db.prepare(`
      UPDATE payments SET status = 'PAID', transaction_ref = ?, updated_at = datetime('now')
      WHERE order_id = ? AND method = 'UPI'
    `).run(transactionRef || `UPI-${Date.now()}`, orderId);

    db.prepare(`
      UPDATE orders SET payment_status = 'PAID', status = 'PREPARING', updated_at = datetime('now')
      WHERE id = ?
    `).run(orderId);
  });

  process();
  return { success: true };
}

/**
 * Process refund for a cancelled order.
 */
function processRefund(orderId, adminId) {
  const db = getDb();

  const order = db.prepare('SELECT id, payment_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  if (order.payment_status !== 'PAID') return { success: false, message: 'Order was not paid — no refund needed' };

  db.prepare(`
    UPDATE payments SET status = 'REFUNDED', updated_at = datetime('now') WHERE order_id = ?
  `).run(orderId);

  db.prepare(`
    UPDATE orders SET payment_status = 'REFUNDED', updated_at = datetime('now') WHERE id = ?
  `).run(orderId);

  return { success: true };
}

module.exports = { processCashPayment, generateUPIPayment, verifyUPIPayment, processRefund };
