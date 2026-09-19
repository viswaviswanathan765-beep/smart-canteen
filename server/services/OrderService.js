'use strict';

const { getDb } = require('../db');
const { deductStock } = require('./StockService');
const { generateToken } = require('./TokenService');
const { generateOrderQR } = require('./QRService');

/**
 * OrderService — unified order engine for ONLINE and COUNTER orders.
 * Both ordering modes call this same service.
 */

let orderSequence = 0;

function getNextOrderNumber(source) {
  const db = getDb();
  const prefix = source === 'COUNTER' ? 'C' : 'O';
  const count = db.prepare("SELECT COUNT(*) as c FROM orders WHERE order_source = ?").get(source).c;
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

/**
 * Create an order (shared between online and counter flows).
 *
 * @param {Object} payload
 * @param {string} payload.orderSource - 'ONLINE' | 'COUNTER'
 * @param {string} payload.customerType - 'STUDENT' | 'STAFF' | 'PARENT' | 'VISITOR' | 'ONLINE'
 * @param {string|null} payload.customerName
 * @param {string|null} payload.customerMobile
 * @param {number|null} payload.customerUserId
 * @param {string} payload.paymentMethod - 'CASH' | 'UPI' | 'CARD' | 'OTHER'
 * @param {Array<{foodItemId, foodName, quantity, unitPrice}>} payload.items
 * @param {number|null} payload.createdByAdminId
 * @param {string|null} payload.notes
 *
 * @returns {{ success: true, order, qrDataUrl } | { success: false, message }}
 */
async function createOrder(payload) {
  const db = getDb();

  const {
    orderSource = 'ONLINE',
    customerType = 'ONLINE',
    customerName = null,
    customerMobile = null,
    customerUserId = null,
    paymentMethod = 'UPI',
    items = [],
    createdByAdminId = null,
    notes = null,
  } = payload;

  if (!items || items.length === 0) {
    return { success: false, message: 'Order must have at least one item' };
  }

  // Validate items and calculate total
  const validatedItems = [];
  let subtotal = 0;

  const foodIds = items.map(i => i.foodItemId);
  const foodRows = db.prepare(`
    SELECT id, name, price, stock, is_available FROM food_items WHERE id IN (${foodIds.map(() => '?').join(',')})
  `).all(...foodIds);

  const foodMap = Object.fromEntries(foodRows.map(r => [r.id, r]));

  for (const item of items) {
    const food = foodMap[item.foodItemId];
    if (!food) return { success: false, message: `Food item #${item.foodItemId} not found` };
    if (!food.is_available) return { success: false, message: `"${food.name}" is not available` };
    if (food.stock < item.quantity) return { success: false, message: `Only ${food.stock} "${food.name}" in stock` };

    const lineTotal = parseFloat((food.price * item.quantity).toFixed(2));
    subtotal += lineTotal;

    validatedItems.push({
      foodItemId: food.id,
      foodName: food.name,
      quantity: item.quantity,
      unitPrice: food.price,
      subtotal: lineTotal,
    });
  }

  const total = parseFloat(subtotal.toFixed(2));

  // Create order + items + deduct stock in one transaction
  const createTx = db.transaction(() => {
    const orderNumber = getNextOrderNumber(orderSource);

    // Generate token for counter orders
    const token = orderSource === 'COUNTER' ? generateToken() : null;

    const orderResult = db.prepare(`
      INSERT INTO orders (
        order_number, token_number, order_source, customer_type,
        customer_name, customer_mobile, customer_user_id,
        payment_method, subtotal, total,
        created_by_admin_id, notes, stock_deducted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      orderNumber, token, orderSource, customerType,
      customerName, customerMobile, customerUserId,
      paymentMethod, subtotal, total,
      createdByAdminId, notes
    );

    const orderId = orderResult.lastInsertRowid;

    // Insert line items
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, food_item_id, food_name, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const vi of validatedItems) {
      insertItem.run(orderId, vi.foodItemId, vi.foodName, vi.quantity, vi.unitPrice, vi.subtotal);
    }

    return orderId;
  });

  const orderId = createTx();

  // Deduct stock atomically (outside the order creation TX for cleaner rollback semantics)
  const stockReason = orderSource === 'COUNTER' ? 'COUNTER_ORDER' : 'ONLINE_ORDER';
  const stockResult = deductStock(
    validatedItems.map(v => ({ foodItemId: v.foodItemId, quantity: v.quantity })),
    stockReason,
    orderId,
    createdByAdminId
  );

  if (!stockResult.success) {
    // Rollback order (cancel it)
    db.prepare("UPDATE orders SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(orderId);
    return { success: false, message: stockResult.message };
  }

  // Mark stock as deducted (for idempotent cancellation)
  db.prepare("UPDATE orders SET stock_deducted = 1, updated_at = datetime('now') WHERE id = ?").run(orderId);

  // Fetch the created order
  const order = getOrderById(orderId);

  // Generate QR code
  let qrDataUrl = null;
  try {
    qrDataUrl = await generateOrderQR(order);
  } catch (e) {
    console.warn('QR generation failed:', e.message);
  }

  return { success: true, order, qrDataUrl };
}

/**
 * Get a full order by ID including line items.
 */
function getOrderById(orderId) {
  const db = getDb();

  const order = db.prepare(`
    SELECT o.*, u.name as admin_name FROM orders o
    LEFT JOIN users u ON u.id = o.created_by_admin_id
    WHERE o.id = ?
  `).get(orderId);

  if (!order) return null;

  order.items = db.prepare(`
    SELECT * FROM order_items WHERE order_id = ? ORDER BY id
  `).all(orderId);

  order.payment = db.prepare(`
    SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1
  `).get(orderId);

  return order;
}

/**
 * Update order status (with state machine validation).
 */
function updateOrderStatus(orderId, newStatus, adminId) {
  const db = getDb();

  const TRANSITIONS = {
    PENDING:    ['PREPARING', 'CANCELLED'],
    PREPARING:  ['READY', 'CANCELLED'],
    READY:      ['COMPLETED'],
    COMPLETED:  [],
    CANCELLED:  [],
  };

  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return { success: false, message: 'Order not found' };

  const allowed = TRANSITIONS[order.status] || [];
  if (!allowed.includes(newStatus)) {
    return { success: false, message: `Cannot transition from ${order.status} to ${newStatus}` };
  }

  db.prepare(`
    UPDATE orders SET status = ?, updated_at = datetime('now')
    ${newStatus === 'CANCELLED' ? ", cancelled_at = datetime('now')" : ''}
    WHERE id = ?
  `).run(newStatus, orderId);

  return { success: true };
}

module.exports = { createOrder, getOrderById, updateOrderStatus, getNextOrderNumber };
