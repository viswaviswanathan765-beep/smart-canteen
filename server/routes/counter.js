'use strict';

const express = require('express');
const { createOrder, getOrderById, updateOrderStatus } = require('../services/OrderService');
const { processCashPayment, generateUPIPayment, verifyUPIPayment } = require('../services/PaymentService');
const { restoreStockForOrder } = require('../services/StockService');
const { getStockSnapshot } = require('../services/StockService');
const { authenticate } = require('../middleware/auth');
const { requireStaff, requireAdmin } = require('../middleware/roles');
const { getDb } = require('../db');

const router = express.Router();

// All counter routes require at least STAFF role
router.use(authenticate, requireStaff);

/**
 * GET /api/counter/stock-check
 * Real-time stock validation before finalizing a counter order.
 * Body: { items: [{foodItemId, quantity}] }
 */
router.post('/stock-check', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Items required' });
  }

  const ids = items.map(i => i.foodItemId);
  const snapshot = getStockSnapshot(ids);
  const stockMap = Object.fromEntries(snapshot.map(r => [r.id, r]));

  const issues = [];
  const valid = [];

  for (const item of items) {
    const food = stockMap[item.foodItemId];
    if (!food) {
      issues.push({ foodItemId: item.foodItemId, issue: 'Not found' });
    } else if (food.stock < item.quantity) {
      issues.push({
        foodItemId: item.foodItemId,
        name: food.name,
        available: food.stock,
        requested: item.quantity,
        message: `Only ${food.stock} "${food.name}" available`,
      });
    } else {
      valid.push({ foodItemId: item.foodItemId, name: food.name, available: food.stock });
    }
  }

  if (issues.length > 0) {
    return res.status(409).json({ success: false, issues, valid });
  }

  res.json({ success: true, message: 'All items available', valid });
});

/**
 * POST /api/counter/orders
 * Create a counter order (admin/staff assisted).
 */
router.post('/orders', async (req, res) => {
  const {
    customerType,
    customerName,
    customerMobile,
    paymentMethod,
    items,
    notes,
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Items are required' });
  }

  if (!customerType || !['STUDENT', 'STAFF', 'PARENT', 'VISITOR'].includes(customerType)) {
    return res.status(400).json({ success: false, message: 'Valid customer type required: STUDENT, STAFF, PARENT, VISITOR' });
  }

  if (!paymentMethod || !['CASH', 'UPI', 'CARD', 'OTHER'].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'Valid payment method required' });
  }

  const result = await createOrder({
    orderSource: 'COUNTER',
    customerType,
    customerName: customerName || null,
    customerMobile: customerMobile || null,
    paymentMethod,
    items,
    createdByAdminId: req.user.id,
    notes: notes || null,
  });

  if (!result.success) {
    return res.status(409).json(result);
  }

  res.status(201).json({
    success: true,
    order: result.order,
    qrDataUrl: result.qrDataUrl,
    token: result.order.token_number,
  });
});

/**
 * POST /api/counter/orders/:id/pay/cash
 * Process cash payment for a counter order.
 */
router.post('/orders/:id/pay/cash', (req, res) => {
  const { amountReceived } = req.body;
  const orderId = parseInt(req.params.id);

  if (!amountReceived || isNaN(amountReceived)) {
    return res.status(400).json({ success: false, message: 'Amount received is required' });
  }

  // Verify this is a counter order
  const db = getDb();
  const order = db.prepare('SELECT order_source FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.order_source !== 'COUNTER') {
    return res.status(403).json({ success: false, message: 'Cash payment only for counter orders' });
  }

  const result = processCashPayment(orderId, parseFloat(amountReceived), req.user.id);
  if (!result.success) return res.status(400).json(result);

  res.json(result);
});

/**
 * POST /api/counter/orders/:id/pay/upi/generate
 * Generate UPI QR for a counter order.
 */
router.post('/orders/:id/pay/upi/generate', async (req, res) => {
  const result = await generateUPIPayment(parseInt(req.params.id));
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

/**
 * POST /api/counter/orders/:id/pay/upi/verify
 * Verify UPI payment (admin confirms after visual/gateway check).
 */
router.post('/orders/:id/pay/upi/verify', (req, res) => {
  const { transactionRef } = req.body;
  const result = verifyUPIPayment(parseInt(req.params.id), transactionRef, req.user.id);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

/**
 * GET /api/counter/orders
 * List today's counter orders.
 */
router.get('/orders', (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.*, u.name as admin_name,
           GROUP_CONCAT(oi.food_name || ' ×' || oi.quantity, ', ') as items_summary
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by_admin_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.order_source = 'COUNTER'
      AND DATE(o.created_at) = DATE('now', 'localtime')
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all();
  res.json({ success: true, orders });
});

/**
 * GET /api/counter/orders/:id
 * Get a specific counter order.
 */
router.get('/orders/:id', (req, res) => {
  const order = getOrderById(parseInt(req.params.id));
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.order_source !== 'COUNTER') return res.status(403).json({ success: false, message: 'Not a counter order' });
  res.json({ success: true, order });
});

/**
 * PUT /api/counter/orders/:id/status
 * Update counter order status.
 */
router.put('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'Status required' });

  const result = updateOrderStatus(parseInt(req.params.id), status, req.user.id);
  if (!result.success) return res.status(400).json(result);

  if (status === 'CANCELLED') {
    restoreStockForOrder(parseInt(req.params.id), req.user.id);
  }

  res.json(result);
});

module.exports = router;
