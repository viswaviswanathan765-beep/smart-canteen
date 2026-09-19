'use strict';

const { getDb } = require('../db');

/**
 * AnalyticsService — sales and order analytics.
 * Single source of truth for both online and counter data.
 */

/**
 * Get today's sales summary broken down by source.
 */
function getDailySummary(date = null) {
  const db = getDb();
  const targetDate = date || new Date().toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT
      order_source,
      COUNT(*) as order_count,
      SUM(CASE WHEN payment_status = 'PAID' THEN total ELSE 0 END) as revenue,
      SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) as paid_count
    FROM orders
    WHERE DATE(created_at) = ? AND status != 'CANCELLED'
    GROUP BY order_source
  `).all(targetDate);

  const result = { date: targetDate, online: null, counter: null, total: { order_count: 0, revenue: 0 } };

  for (const row of rows) {
    const key = row.order_source === 'ONLINE' ? 'online' : 'counter';
    result[key] = row;
    result.total.order_count += row.order_count;
    result.total.revenue += row.revenue;
  }

  return result;
}

/**
 * Get revenue breakdown for a date range.
 */
function getRevenueByDateRange(startDate, endDate) {
  const db = getDb();

  return db.prepare(`
    SELECT
      DATE(created_at) as date,
      order_source,
      COUNT(*) as orders,
      SUM(CASE WHEN payment_status = 'PAID' THEN total ELSE 0 END) as revenue
    FROM orders
    WHERE DATE(created_at) BETWEEN ? AND ? AND status != 'CANCELLED'
    GROUP BY DATE(created_at), order_source
    ORDER BY date ASC
  `).all(startDate, endDate);
}

/**
 * Get top-selling items.
 */
function getTopItems(limit = 10, days = 7) {
  const db = getDb();

  return db.prepare(`
    SELECT
      oi.food_name,
      SUM(oi.quantity) as total_qty,
      SUM(oi.subtotal) as total_revenue,
      COUNT(DISTINCT oi.order_id) as order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE DATE(o.created_at) >= DATE('now', ?)
      AND o.status != 'CANCELLED'
      AND o.payment_status = 'PAID'
    GROUP BY oi.food_name
    ORDER BY total_qty DESC
    LIMIT ?
  `).all(`-${days} days`, limit);
}

/**
 * Get orders with optional filters.
 */
function getOrders({ source, status, paymentStatus, customerType, paymentMethod, date, page = 1, limit = 50 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (source) { conditions.push('o.order_source = ?'); params.push(source); }
  if (status) { conditions.push('o.status = ?'); params.push(status); }
  if (paymentStatus) { conditions.push('o.payment_status = ?'); params.push(paymentStatus); }
  if (customerType) { conditions.push('o.customer_type = ?'); params.push(customerType); }
  if (paymentMethod) { conditions.push('o.payment_method = ?'); params.push(paymentMethod); }
  if (date) { conditions.push("DATE(o.created_at) = ?"); params.push(date); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const orders = db.prepare(`
    SELECT
      o.*,
      u.name as admin_name,
      GROUP_CONCAT(oi.food_name || ' ×' || oi.quantity, ', ') as items_summary
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by_admin_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    ${where}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM orders o ${where}`).get(...params).c;

  return { orders, total, page, limit };
}

/**
 * Payment method breakdown.
 */
function getPaymentMethodBreakdown(days = 30) {
  const db = getDb();

  return db.prepare(`
    SELECT
      payment_method,
      COUNT(*) as count,
      SUM(total) as revenue
    FROM orders
    WHERE DATE(created_at) >= DATE('now', ?)
      AND payment_status = 'PAID'
    GROUP BY payment_method
    ORDER BY revenue DESC
  `).all(`-${days} days`);
}

module.exports = {
  getDailySummary,
  getRevenueByDateRange,
  getTopItems,
  getOrders,
  getPaymentMethodBreakdown,
};
