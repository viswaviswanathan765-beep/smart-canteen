'use strict';

const express = require('express');
const {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  processRefund,
  getReceipt,
} = require('../services/PaymentService');
const { verifyAndRedeemQR } = require('../services/QRService');
const { authenticate } = require('../middleware/auth');
const { requireStaff, requireAdmin } = require('../middleware/roles');
const { getDb } = require('../db');

const router = express.Router();

/**
 * POST /api/payments/create-order
 * Customer requests a payment gateway order (Razorpay).
 */
router.post('/create-order', async (req, res) => {
  const { orderId, providerName = 'RAZORPAY', idempotencyKey } = req.body;

  if (!orderId) {
    return res.status(400).json({ success: false, code: 'PARAM_REQUIRED', message: 'orderId is required' });
  }

  const result = await createPaymentOrder({
    orderId: parseInt(orderId),
    providerName,
    idempotencyKey: idempotencyKey || null,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
});

/**
 * POST /api/payments/verify
 * Customer frontend submits payment signature for server-side verification.
 */
router.post('/verify', async (req, res) => {
  const { providerOrderId, providerPaymentId, signature, providerName = 'RAZORPAY' } = req.body;

  if (!providerOrderId || !providerPaymentId || !signature) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_PAYMENT_CREDENTIALS',
      message: 'providerOrderId, providerPaymentId, and signature are all required for verification',
    });
  }

  const result = await verifyPayment({
    providerOrderId,
    providerPaymentId,
    signature,
    providerName,
  });

  if (!result.success) {
    const statusCode = result.code === 'PAYMENT_EXCEPTION' ? 409 : 400;
    return res.status(statusCode).json(result);
  }

  res.json(result);
});

/**
 * POST /api/payments/webhook
 * Webhook handler for asynchronous payment capture events (Razorpay).
 */
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!signature) {
    return res.status(400).json({ success: false, message: 'Missing x-razorpay-signature header' });
  }

  const result = await handleWebhook(rawBody, signature, req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * GET /api/payments
 * Admin audit trail with filters (Successful, Pending, Failed, Refunded, Cash, UPI).
 */
router.get('/', authenticate, requireStaff, (req, res) => {
  const db = getDb();
  const { status, provider, method, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT p.*, o.order_number, o.customer_name, o.customer_type
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND p.status = ?';
    params.push(status.toUpperCase());
  }

  if (provider) {
    query += ' AND p.provider = ?';
    params.push(provider.toUpperCase());
  }

  if (method) {
    query += ' AND p.method = ?';
    params.push(method.toUpperCase());
  }

  query += ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const payments = db.prepare(query).all(...params);
  const totalCount = db.prepare('SELECT COUNT(*) as count FROM payments').get().count;

  res.json({ success: true, payments, total: totalCount });
});

/**
 * GET /api/payments/:id
 * Retrieve a specific payment record.
 */
router.get('/:id', authenticate, requireStaff, (req, res) => {
  const db = getDb();
  const payment = db.prepare(`
    SELECT p.*, o.order_number, o.customer_name, o.total as order_total
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE p.id = ?
  `).get(parseInt(req.params.id));

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment record not found' });
  }

  res.json({ success: true, payment });
});

/**
 * POST /api/payments/:orderId/refund
 * Admin processes a refund for an order.
 */
router.post('/:orderId/refund', authenticate, requireAdmin, async (req, res) => {
  const { reason } = req.body;
  const result = await processRefund(parseInt(req.params.orderId), reason, req.user.id);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * GET /api/payments/receipt/:orderId
 * Public / Customer endpoint to retrieve digital receipt.
 */
router.get('/receipt/:orderId', (req, res) => {
  const receipt = getReceipt(parseInt(req.params.orderId));
  if (!receipt) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }
  res.json({ success: true, receipt });
});

/**
 * POST /api/payments/qr/verify
 * Staff/Admin scans customer QR to verify and complete food handover.
 */
router.post('/qr/verify', authenticate, requireStaff, (req, res) => {
  const { token } = req.body;
  const result = verifyAndRedeemQR(token, req.user.id);

  if (!result.success) {
    const statusCode = result.code === 'ORDER_ALREADY_COLLECTED' ? 409 : 400;
    return res.status(statusCode).json(result);
  }

  res.json(result);
});

module.exports = router;
