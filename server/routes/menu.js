'use strict';

const express = require('express');
const { getDb } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

const router = express.Router();

// GET /api/menu — public, all available food items with categories
router.get('/', (req, res) => {
  const db = getDb();
  const { category } = req.query;

  let query = `
    SELECT f.*, c.name as category_name, c.sort_order
    FROM food_items f
    LEFT JOIN categories c ON c.id = f.category_id
    WHERE f.is_available = 1
  `;
  const params = [];

  if (category) {
    query += ' AND c.name = ?';
    params.push(category);
  }

  query += ' ORDER BY c.sort_order ASC, f.name ASC';

  const items = db.prepare(query).all(...params);
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();

  res.json({ success: true, items, categories });
});

// GET /api/menu/stock-check — validate stock for a list of items (used before checkout)
router.post('/stock-check', (req, res) => {
  const { items } = req.body; // [{foodItemId, quantity}]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Items array required' });
  }

  const db = getDb();
  const ids = items.map(i => i.foodItemId);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id, name, stock FROM food_items WHERE id IN (${placeholders})`).all(...ids);
  const stockMap = Object.fromEntries(rows.map(r => [r.id, r]));

  const issues = [];
  for (const item of items) {
    const food = stockMap[item.foodItemId];
    if (!food) {
      issues.push({ foodItemId: item.foodItemId, issue: 'Not found' });
    } else if (food.stock < item.quantity) {
      issues.push({ foodItemId: item.foodItemId, name: food.name, available: food.stock, requested: item.quantity });
    }
  }

  if (issues.length > 0) {
    return res.status(409).json({ success: false, issues });
  }

  res.json({ success: true, message: 'All items in stock' });
});

// --- ADMIN ROUTES ---

// GET /api/menu/admin — all items including unavailable (admin)
router.get('/admin', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT f.*, c.name as category_name FROM food_items f
    LEFT JOIN categories c ON c.id = f.category_id
    ORDER BY c.sort_order ASC, f.name ASC
  `).all();
  res.json({ success: true, items });
});

// POST /api/menu — add food item (admin)
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, description, price, stock, categoryId, imageEmoji, isAvailable } = req.body;
  if (!name || price == null) return res.status(400).json({ success: false, message: 'Name and price required' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO food_items (name, description, price, stock, category_id, image_emoji, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, description || '', price, stock || 0, categoryId || null, imageEmoji || '🍽️', isAvailable !== false ? 1 : 0);

  // Log initial stock
  if (stock > 0) {
    db.prepare(`
      INSERT INTO stock_history (food_item_id, previous_stock, change_amount, new_stock, reason, admin_id, note)
      VALUES (?, 0, ?, ?, 'INITIAL', ?, 'New item created')
    `).run(result.lastInsertRowid, stock, stock, req.user.id);
  }

  const item = db.prepare('SELECT * FROM food_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, item });
});

// PUT /api/menu/:id — update food item (admin)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, description, price, categoryId, imageEmoji, isAvailable } = req.body;
  const db = getDb();

  const item = db.prepare('SELECT * FROM food_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

  db.prepare(`
    UPDATE food_items SET name = ?, description = ?, price = ?, category_id = ?,
      image_emoji = ?, is_available = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? item.name, description ?? item.description, price ?? item.price,
    categoryId ?? item.category_id, imageEmoji ?? item.image_emoji,
    isAvailable !== undefined ? (isAvailable ? 1 : 0) : item.is_available,
    item.id
  );

  res.json({ success: true, item: db.prepare('SELECT * FROM food_items WHERE id = ?').get(item.id) });
});

// DELETE /api/menu/:id — soft delete (mark unavailable)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE food_items SET is_available = 0, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
