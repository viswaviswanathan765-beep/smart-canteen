'use strict';

const { getDb } = require('../db');

/**
 * StockService — atomic stock management with full audit trail.
 * All mutations use SQLite transactions to prevent race conditions.
 */

/**
 * Atomically deduct stock for a list of items.
 * Rolls back if ANY item has insufficient stock.
 *
 * @param {Array<{foodItemId, quantity}>} items
 * @param {string} reason - e.g. 'ONLINE_ORDER' | 'COUNTER_ORDER'
 * @param {number|null} orderId
 * @param {number|null} adminId
 * @returns {{ success: true } | { success: false, message: string, item: string }}
 */
function deductStock(items, reason, orderId = null, adminId = null) {
  const db = getDb();

  const deduct = db.transaction((itemList) => {
    for (const { foodItemId, quantity } of itemList) {
      // Lock the row and check stock atomically
      const row = db.prepare(`
        SELECT id, name, stock FROM food_items WHERE id = ? AND is_available = 1
      `).get(foodItemId);

      if (!row) {
        throw { code: 'NOT_FOUND', message: `Food item #${foodItemId} not found or unavailable` };
      }

      if (row.stock < quantity) {
        throw { code: 'INSUFFICIENT_STOCK', message: `Only ${row.stock} "${row.name}" available`, item: row.name };
      }

      const newStock = row.stock - quantity;

      // Atomic update with stock >= quantity guard (double safety)
      const result = db.prepare(`
        UPDATE food_items SET stock = stock - ?, updated_at = datetime('now')
        WHERE id = ? AND stock >= ?
      `).run(quantity, foodItemId, quantity);

      if (result.changes === 0) {
        throw { code: 'RACE_CONDITION', message: `Stock conflict for "${row.name}" — please retry`, item: row.name };
      }

      // Record stock history
      db.prepare(`
        INSERT INTO stock_history (food_item_id, previous_stock, change_amount, new_stock, reason, order_id, admin_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(foodItemId, row.stock, -quantity, newStock, reason, orderId, adminId);
    }
  });

  try {
    deduct(items);
    return { success: true };
  } catch (err) {
    if (err.code) {
      return { success: false, message: err.message, item: err.item };
    }
    throw err;
  }
}

/**
 * Restore stock for a cancelled order (idempotent — checks order state first).
 *
 * @param {number} orderId
 * @param {number|null} adminId
 * @returns {{ success: true, restored: number } | { success: false, message: string }}
 */
function restoreStockForOrder(orderId, adminId = null) {
  const db = getDb();

  const restore = db.transaction(() => {
    const order = db.prepare(`
      SELECT id, status, stock_deducted FROM orders WHERE id = ?
    `).get(orderId);

    if (!order) {
      throw { code: 'NOT_FOUND', message: 'Order not found' };
    }

    if (!order.stock_deducted) {
      return { restored: 0, skipped: true };
    }

    const items = db.prepare(`
      SELECT food_item_id, food_name, quantity FROM order_items WHERE order_id = ?
    `).all(orderId);

    for (const item of items) {
      if (!item.food_item_id) continue;

      const row = db.prepare('SELECT stock FROM food_items WHERE id = ?').get(item.food_item_id);
      if (!row) continue;

      const newStock = row.stock + item.quantity;

      db.prepare(`
        UPDATE food_items SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?
      `).run(item.quantity, item.food_item_id);

      db.prepare(`
        INSERT INTO stock_history (food_item_id, previous_stock, change_amount, new_stock, reason, order_id, admin_id)
        VALUES (?, ?, ?, ?, 'CANCELLATION', ?, ?)
      `).run(item.food_item_id, row.stock, item.quantity, newStock, orderId, adminId);
    }

    // Mark stock as restored — prevents double restoration
    db.prepare(`UPDATE orders SET stock_deducted = 0, updated_at = datetime('now') WHERE id = ?`).run(orderId);

    return { restored: items.length };
  });

  try {
    const result = restore();
    return { success: true, ...result };
  } catch (err) {
    if (err.code) {
      return { success: false, message: err.message };
    }
    throw err;
  }
}

/**
 * Manually adjust stock for an item (admin action).
 */
function adjustStock(foodItemId, quantity, note, adminId) {
  const db = getDb();

  const row = db.prepare('SELECT id, name, stock FROM food_items WHERE id = ?').get(foodItemId);
  if (!row) return { success: false, message: 'Item not found' };

  const newStock = row.stock + quantity;
  if (newStock < 0) return { success: false, message: `Cannot reduce stock below 0 (current: ${row.stock})` };

  db.prepare(`UPDATE food_items SET stock = ?, updated_at = datetime('now') WHERE id = ?`).run(newStock, foodItemId);
  db.prepare(`
    INSERT INTO stock_history (food_item_id, previous_stock, change_amount, new_stock, reason, admin_id, note)
    VALUES (?, ?, ?, ?, 'MANUAL_ADJUSTMENT', ?, ?)
  `).run(foodItemId, row.stock, quantity, newStock, adminId, note || 'Manual adjustment');

  return { success: true, newStock };
}

/**
 * Get current stock for a list of food item IDs (for frontend validation).
 */
function getStockSnapshot(foodItemIds) {
  const db = getDb();
  const placeholders = foodItemIds.map(() => '?').join(',');
  return db.prepare(`SELECT id, name, stock FROM food_items WHERE id IN (${placeholders})`).all(...foodItemIds);
}

module.exports = { deductStock, restoreStockForOrder, adjustStock, getStockSnapshot };
