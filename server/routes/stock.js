'use strict';

const express = require('express');
const { getDb } = require('../db');
const { adjustStock } = require('../services/StockService');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requireStaff } = require('../middleware/roles');

const router = express.Router();

router.use(authenticate, requireStaff);

// GET /api/stock — all food items with stock levels
router.get('/', (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT f.*, c.name as category_name
    FROM food_items f
    LEFT JOIN categories c ON c.id = f.category_id
    ORDER BY c.sort_order, f.name
  `).all();
  res.json({ success: true, items });
});

// PUT /api/stock/:id — adjust stock (admin only)
router.put('/:id', requireAdmin, (req, res) => {
  const { quantity, note } = req.body;
  if (quantity == null || isNaN(quantity)) {
    return res.status(400).json({ success: false, message: 'Quantity (positive or negative adjustment) required' });
  }

  const result = adjustStock(parseInt(req.params.id), parseInt(quantity), note, req.user.id);
  if (!result.success) return res.status(400).json(result);

  res.json(result);
});

// GET /api/stock/:id/history — stock history for one item
router.get('/:id/history', (req, res) => {
  const db = getDb();
  const history = db.prepare(`
    SELECT sh.*, u.name as admin_name, o.order_number
    FROM stock_history sh
    LEFT JOIN users u ON u.id = sh.admin_id
    LEFT JOIN orders o ON o.id = sh.order_id
    WHERE sh.food_item_id = ?
    ORDER BY sh.created_at DESC
    LIMIT 100
  `).all(req.params.id);
  res.json({ success: true, history });
});

// GET /api/stock/history — all stock history (admin)
router.get('/history/all', requireAdmin, (req, res) => {
  const db = getDb();
  const history = db.prepare(`
    SELECT sh.*, f.name as food_name, u.name as admin_name, o.order_number
    FROM stock_history sh
    JOIN food_items f ON f.id = sh.food_item_id
    LEFT JOIN users u ON u.id = sh.admin_id
    LEFT JOIN orders o ON o.id = sh.order_id
    ORDER BY sh.created_at DESC
    LIMIT 200
  `).all();
  res.json({ success: true, history });
});

module.exports = router;
