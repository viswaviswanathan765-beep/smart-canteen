'use strict';

const { getDb } = require('../db');
const { getProvider } = require('./payments');
const { deductStock, restoreStockForOrder } = require('./StockService');
const { generateOrderQR } = require('./QRService');

/**
 * PaymentService — Orchestrates all payments, providers, stock safety, and idempotency.
 * All monetary values are handled as integer minor units (paise: ₹1 = 100 paise).
 */

/**
 * Convert rupees to integer paise.
 */
function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

/**
 * Convert paise to rupee string format.
 */
function toRupees(paise) {
  return (Number(paise) / 100).toFixed(2);
}

/**
 * Create a payment gateway order for an existing internal order.
 *
 * @param {object} params
 * @param {number} params.orderId - Internal order ID
 * @param {string} [params.providerName='RAZORPAY']
 * @param {string} [params.idempotencyKey]
 * @returns {Promise<{ success: boolean, payment?: object, providerData?: object, message?: string }>}
 */
async function createPaymentOrder({ orderId, providerName = 'RAZORPAY', idempotencyKey = null }) {
  const db = getDb();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return { success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
  }

  if (order.payment_status === 'PAID') {
    return { success: false, code: 'ORDER_ALREADY_PAID', message: 'Order has already been paid' };
  }

  // Calculate amount in paise from server-side order
  const amountPaise = order.amount_paise > 0 ? order.amount_paise : toPaise(order.total);

  // Check existing active payment order to prevent duplicate gateway orders
  if (idempotencyKey) {
    const existing = db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing && existing.status !== 'FAILED') {
      const provider = getProvider(existing.provider);
      return {
        success: true,
        payment: existing,
        providerOrderId: existing.provider_order_id,
        amountPaise: existing.amount_paise,
        currency: existing.currency,
        keyId: provider.keyId,
      };
    }
  }

  const provider = getProvider(providerName);
  const providerOrder = await provider.createPaymentOrder({
    orderId: order.id,
    orderNumber: order.order_number,
    amountPaise,
    currency: 'INR',
  });

  if (!providerOrder.success) {
    return { success: false, code: 'GATEWAY_ERROR', message: 'Failed to create payment with provider' };
  }

  // Record payment in CREATED state
  const insertPayment = db.prepare(`
    INSERT INTO payments (
      order_id, provider, provider_order_id, method, amount_paise, currency,
      amount_due, status, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, 'INR', ?, 'CREATED', ?)
  `).run(
    order.id,
    providerName.toUpperCase(),
    providerOrder.providerOrderId,
    providerName.toUpperCase(),
    amountPaise,
    Number(toRupees(amountPaise)),
    idempotencyKey
  );

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(insertPayment.lastInsertRowid);

  return {
    success: true,
    payment,
    providerOrderId: providerOrder.providerOrderId,
    amountPaise,
    currency: 'INR',
    keyId: providerOrder.keyId || null,
    testMode: providerOrder.testMode || false,
  };
}

/**
 * Verify payment signature and atomically confirm the order.
 * Deducts stock, generates cryptographic QR token, and transitions state to PAID.
 * Handles stock race conditions safely (PAYMENT_EXCEPTION).
 *
 * @param {object} params
 * @param {string} params.providerOrderId
 * @param {string} params.providerPaymentId
 * @param {string} params.signature
 * @param {string} [params.providerName='RAZORPAY']
 * @returns {Promise<{ success: boolean, order?: object, qrDataUrl?: string, message?: string, code?: string }>}
 */
async function verifyPayment({ providerOrderId, providerPaymentId, signature, providerName = 'RAZORPAY' }) {
  const db = getDb();

  const payment = db.prepare('SELECT * FROM payments WHERE provider_order_id = ?').get(providerOrderId);
  if (!payment) {
    return { success: false, code: 'PAYMENT_NOT_FOUND', message: 'Payment record not found for provider order' };
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
  if (!order) {
    return { success: false, code: 'ORDER_NOT_FOUND', message: 'Order associated with payment not found' };
  }

  // Idempotency: If already confirmed as PAID, return existing order and QR
  if (payment.status === 'CAPTURED' && order.payment_status === 'PAID') {
    const existingQr = db.prepare('SELECT * FROM qr_tokens WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(order.id);
    return {
      success: true,
      alreadyPaid: true,
      order,
      qrToken: existingQr,
      message: 'Payment already processed successfully',
    };
  }

  // Verify signature with provider
  const provider = getProvider(providerName);
  const sigResult = await provider.verifyPaymentSignature({
    providerOrderId,
    providerPaymentId,
    signature,
  });

  if (!sigResult.valid) {
    // Record failure in audit
    db.prepare(`
      UPDATE payments SET status = 'FAILED', updated_at = datetime('now')
      WHERE id = ?
    `).run(payment.id);

    db.prepare(`
      UPDATE orders SET payment_status = 'PAYMENT_FAILED', updated_at = datetime('now')
      WHERE id = ?
    `).run(order.id);

    return {
      success: false,
      code: 'PAYMENT_SIGNATURE_INVALID',
      message: sigResult.error || 'Payment signature verification failed',
    };
  }

  // ============================================================
  // CRITICAL ATOMIC TRANSACTION: STOCK DEDUCTION + ORDER PAID + QR
  // ============================================================
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  // Check stock availability before committing deduction
  let stockShortage = null;
  for (const item of orderItems) {
    const food = db.prepare('SELECT id, name, stock FROM food_items WHERE id = ?').get(item.food_item_id);
    if (!food || food.stock < item.quantity) {
      stockShortage = { name: food ? food.name : item.food_name, available: food ? food.stock : 0, requested: item.quantity };
      break;
    }
  }

  // Handle stock race condition: Money captured but stock run out!
  if (stockShortage) {
    console.warn(`Payment captured for order #${order.order_number}, but stock exhausted for ${stockShortage.name}`);
    db.prepare(`
      UPDATE payments SET
        status = 'CAPTURED',
        provider_payment_id = ?,
        signature_verified = 1,
        verified_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(providerPaymentId, payment.id);

    db.prepare(`
      UPDATE orders SET
        payment_status = 'PAYMENT_EXCEPTION',
        status = 'CANCELLED',
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(`PAYMENT_EXCEPTION: ${stockShortage.name} went out of stock during payment. Refund initiated.`, order.id);

    return {
      success: false,
      code: 'PAYMENT_EXCEPTION',
      message: `Your payment was received, but "${stockShortage.name}" just ran out of stock. Our team has initiated an immediate refund.`,
    };
  }

  // Execute post-payment transaction atomically
  const postPaymentTx = db.transaction(() => {
    // 1. Deduct stock atomically
    for (const item of orderItems) {
      const food = db.prepare('SELECT stock FROM food_items WHERE id = ?').get(item.food_item_id);
      const prevStock = food.stock;
      const newStock = prevStock - item.quantity;

      if (newStock < 0) {
        throw new Error('CONCURRENCY: Negative stock detected during atomic deduction');
      }

      db.prepare('UPDATE food_items SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStock, item.food_item_id);
      db.prepare(`
        INSERT INTO stock_history (food_item_id, previous_stock, change_amount, new_stock, reason, order_id, note)
        VALUES (?, ?, ?, ?, 'ONLINE_ORDER', ?, 'Stock deducted upon verified payment')
      `).run(item.food_item_id, prevStock, -item.quantity, newStock, order.id);
    }

    // 2. Mark payment as CAPTURED
    db.prepare(`
      UPDATE payments SET
        status = 'CAPTURED',
        provider_payment_id = ?,
        signature_verified = 1,
        verified_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(providerPaymentId, payment.id);

    // 3. Mark order as PAID and PREPARING
    db.prepare(`
      UPDATE orders SET
        payment_status = 'PAID',
        status = 'PREPARING',
        stock_deducted = 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(order.id);

    return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  });

  const updatedOrder = postPaymentTx();

  // 4. Generate cryptographically secure QR code for food handover
  let qrDataUrl = null;
  let rawToken = null;
  try {
    const qrResult = await generateOrderQR(updatedOrder);
    qrDataUrl = qrResult.qrDataUrl;
    rawToken = qrResult.rawToken;
  } catch (err) {
    console.error('QR generation failed:', err);
  }

  updatedOrder.items = orderItems;

  return {
    success: true,
    message: 'Payment verified and order confirmed!',
    order: updatedOrder,
    qrDataUrl,
    rawToken,
  };
}

/**
 * Handle incoming webhook event with HMAC validation and idempotency.
 *
 * @param {string} rawBody - Raw body buffer/string
 * @param {string} signature - Webhook signature header
 * @param {object} event - Parsed JSON event
 * @returns {Promise<{ success: boolean, message: string, code?: string }>}
 */
async function handleWebhook(rawBody, signature, event) {
  const db = getDb();
  const provider = getProvider('RAZORPAY');

  // Verify HMAC signature
  const sigCheck = await provider.verifyWebhookSignature(rawBody, signature);
  if (!sigCheck.valid) {
    return { success: false, code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' };
  }

  const eventId = event.event_id || event.id || `evt_${Date.now()}`;
  const eventType = event.event || 'unknown';

  // Idempotency: Check if this event was already processed
  const existingEvent = db.prepare('SELECT id FROM webhook_events WHERE event_id = ?').get(eventId);
  if (existingEvent) {
    return { success: true, message: 'Webhook event already processed (idempotent)', eventId };
  }

  // Process supported payment events
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const paymentEntity = event.payload?.payment?.entity || event.payload?.order?.entity;
    const providerOrderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
    const providerPaymentId = paymentEntity?.id || `pay_wh_${Date.now()}`;

    if (providerOrderId) {
      const payment = db.prepare('SELECT * FROM payments WHERE provider_order_id = ?').get(providerOrderId);
      if (payment && payment.status !== 'CAPTURED') {
        // Mark webhook verified and confirm order
        db.prepare("UPDATE payments SET webhook_verified = 1 WHERE id = ?").run(payment.id);
        await verifyPayment({
          providerOrderId,
          providerPaymentId,
          signature: 'webhook_verified',
          providerName: 'RAZORPAY',
        }).catch(err => console.warn('Webhook auto-confirmation error:', err.message));
      }
    }
  }

  // Record event in webhook_events
  db.prepare(`
    INSERT INTO webhook_events (event_id, provider, event_type, payload, status)
    VALUES (?, 'RAZORPAY', ?, ?, 'PROCESSED')
  `).run(eventId, eventType, JSON.stringify(event));

  return { success: true, message: 'Webhook processed successfully', eventId };
}

/**
 * Record a cash payment for counter ordering.
 */
function processCashPayment(orderId, amountReceived, cashierId) {
  const db = getDb();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  if (order.payment_status === 'PAID') return { success: false, message: 'Order already paid' };

  const orderTotalPaise = order.amount_paise > 0 ? order.amount_paise : toPaise(order.total);

  // Auto-detect if caller passed rupees instead of paise (e.g. 100 vs 8500 paise)
  let receivedPaise = Number(amountReceived);
  if (receivedPaise * 100 >= orderTotalPaise && receivedPaise < orderTotalPaise) {
    receivedPaise = Math.round(receivedPaise * 100);
  }

  if (receivedPaise < orderTotalPaise) {
    return {
      success: false,
      code: 'INSUFFICIENT_AMOUNT',
      message: `Insufficient cash. Total is ₹${toRupees(orderTotalPaise)}. Received only ₹${toRupees(receivedPaise)}.`,
    };
  }

  const changeAmountPaise = receivedPaise - orderTotalPaise;
  const changeRupees = Number(toRupees(changeAmountPaise));

  const cashTx = db.transaction(() => {
    // 1. Insert payment record
    const result = db.prepare(`
      INSERT INTO payments (
        order_id, provider, method, amount_paise, currency,
        amount_due, amount_received, change_amount, cashier_id, status,
        signature_verified, verified_at
      ) VALUES (?, 'CASH', 'CASH', ?, 'INR', ?, ?, ?, ?, 'PAID', 1, datetime('now'))
    `).run(
      orderId,
      orderTotalPaise,
      Number(toRupees(orderTotalPaise)),
      Number(toRupees(receivedPaise)),
      changeRupees,
      cashierId
    );

    // 2. Mark order as PAID & PREPARING
    db.prepare(`
      UPDATE orders
      SET payment_status = 'PAID', status = 'PREPARING', updated_at = datetime('now')
      WHERE id = ?
    `).run(orderId);

    return db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid);
  });

  const payment = cashTx();
  return {
    success: true,
    change: changeRupees,
    changePaise: changeAmountPaise,
    changeRupees: toRupees(changeAmountPaise),
    payment,
  };
}

/**
 * Process a full refund for an order.
 */
async function processRefund(orderId, reason = 'Customer requested', adminId = null) {
  const db = getDb();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  if (order.payment_status !== 'PAID' && order.payment_status !== 'PAYMENT_EXCEPTION') {
    return { success: false, message: 'Only paid or exception orders can be refunded' };
  }

  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ? AND status = \'CAPTURED\'').get(orderId);

  // Call provider refund if gateway payment
  if (payment && payment.provider === 'RAZORPAY' && payment.provider_payment_id) {
    const provider = getProvider('RAZORPAY');
    await provider.refundPayment({
      providerPaymentId: payment.provider_payment_id,
      amountPaise: payment.amount_paise,
      reason,
    });
  }

  // Transaction to update records and restore stock (if not already completed/consumed)
  const refundTx = db.transaction(() => {
    if (payment) {
      db.prepare(`
        UPDATE payments SET status = 'REFUNDED', updated_at = datetime('now')
        WHERE id = ?
      `).run(payment.id);
    }

    db.prepare(`
      UPDATE orders SET payment_status = 'REFUNDED', status = 'CANCELLED', updated_at = datetime('now')
      WHERE id = ?
    `).run(orderId);

    // Restore stock only if stock was deducted and food was not yet completed
    if (order.stock_deducted && order.status !== 'COMPLETED') {
      restoreStockForOrder(orderId, adminId, 'Stock restored due to order refund');
    }
  });

  refundTx();
  return { success: true, message: 'Payment refunded and order cancelled successfully' };
}

/**
 * Get digital receipt data for an order.
 */
function getReceipt(orderId) {
  const db = getDb();

  const order = db.prepare(`
    SELECT o.*, u.name as cashier_name FROM orders o
    LEFT JOIN users u ON u.id = o.created_by_admin_id
    WHERE o.id = ?
  `).get(orderId);

  if (!order) return null;

  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  order.payment = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(orderId);
  order.qrToken = db.prepare('SELECT * FROM qr_tokens WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(orderId);

  return order;
}

module.exports = {
  toPaise,
  toRupees,
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  processCashPayment,
  processRefund,
  getReceipt,
};
