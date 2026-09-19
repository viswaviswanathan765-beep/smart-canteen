'use strict';

const express = require('express');
const { createOrder, getOrderById, updateOrderStatus } = require('../services/OrderService');
const { restoreStockForOrder } = require('../services/StockService');
const { generateUPIPayment, verifyUPIPayment, processRefund, confirmCustomerPayment } = require('../services/PaymentService');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requireStaff } = require('../middleware/roles');
const { getDb } = require('../db');
const { getOrders } = require('../services/AnalyticsService');

const router = express.Router();

// POST /api/orders — create an online order (customer self-order)
router.post('/', async (req, res) => {
  const { items, customerName, customerMobile, paymentMethod, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Items are required' });
  }

  const result = await createOrder({
    orderSource: 'ONLINE',
    customerType: 'ONLINE',
    customerName: customerName || null,
    customerMobile: customerMobile || null,
    customerUserId: req.user?.id || null,
    paymentMethod: paymentMethod || 'UPI',
    items,
    notes: notes || null,
  });

  if (!result.success) return res.status(409).json(result);

  res.status(201).json(result);
});

// GET /api/orders/:id — get order status (public for order tracking)
router.get('/:id', (req, res) => {
  const order = getOrderById(parseInt(req.params.id));
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order });
});

// GET /api/orders/track/:orderNumber — track by order number
router.get('/track/:orderNumber', (req, res) => {
  const db = getDb();
  const o = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!o) return res.status(404).json({ success: false, message: 'Order not found' });
  const order = getOrderById(o.id);
  res.json({ success: true, order });
});

// POST /api/orders/:id/pay/upi — generate UPI QR for online order
router.post('/:id/pay/upi', async (req, res) => {
  const result = await generateUPIPayment(parseInt(req.params.id));
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// POST /api/orders/:id/pay/upi/verify — verify UPI payment (staff/admin)
router.post('/:id/pay/upi/verify', authenticate, requireStaff, (req, res) => {
  const { transactionRef } = req.body;
  const result = verifyUPIPayment(parseInt(req.params.id), transactionRef, req.user.id);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// POST /api/orders/:id/pay/upi/confirm — customer self-service confirm (or gateway callback)
router.post('/:id/pay/upi/confirm', (req, res) => {
  const { transactionRef } = req.body;
  const result = confirmCustomerPayment(parseInt(req.params.id), transactionRef);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// --- ADMIN ORDER MANAGEMENT ---

// GET /api/orders — list all orders (admin)
router.get('/', authenticate, requireStaff, (req, res) => {
  const { source, status, paymentStatus, customerType, paymentMethod, date, page, limit } = req.query;
  const result = getOrders({ source, status, paymentStatus, customerType, paymentMethod, date, page: +page || 1, limit: +limit || 50 });
  res.json({ success: true, ...result });
});

// PUT /api/orders/:id/status — update order status (admin/staff)
router.put('/:id/status', authenticate, requireStaff, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'Status required' });

  const result = updateOrderStatus(parseInt(req.params.id), status, req.user.id);

  if (!result.success) return res.status(400).json(result);

  // If cancelled, restore stock
  if (status === 'CANCELLED') {
    restoreStockForOrder(parseInt(req.params.id), req.user.id);
  }

  res.json(result);
});

// POST /api/orders/:id/cancel — cancel an order (admin)
router.post('/:id/cancel', authenticate, requireAdmin, (req, res) => {
  const orderId = parseInt(req.params.id);
  const statusResult = updateOrderStatus(orderId, 'CANCELLED', req.user.id);
  if (!statusResult.success) return res.status(400).json(statusResult);

  const stockResult = restoreStockForOrder(orderId, req.user.id);

  // Issue refund if applicable
  const db = getDb();
  const order = db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(orderId);
  if (order?.payment_status === 'PAID') {
    processRefund(orderId, req.user.id);
  }

  res.json({ success: true, stockRestored: stockResult.success });
});

// GET /api/orders/pickup/board — pickup board (tokens + statuses)
router.get('/pickup/board', authenticate, requireStaff, (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT order_number, token_number, status, customer_type, customer_name, total,
           payment_method, payment_status, order_source, created_at
    FROM orders
    WHERE status IN ('PREPARING', 'READY', 'PENDING')
      AND DATE(created_at) = DATE('now', 'localtime')
    ORDER BY created_at ASC
    LIMIT 50
  `).all();
  res.json({ success: true, orders });
});

module.exports = router;
