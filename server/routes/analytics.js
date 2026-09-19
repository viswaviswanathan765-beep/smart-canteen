'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireStaff } = require('../middleware/roles');
const {
  getDailySummary,
  getRevenueByDateRange,
  getTopItems,
  getPaymentMethodBreakdown,
} = require('../services/AnalyticsService');

const router = express.Router();

router.use(authenticate, requireStaff);

// GET /api/analytics/summary?date=YYYY-MM-DD
router.get('/summary', (req, res) => {
  const { date } = req.query;
  const summary = getDailySummary(date || null);
  res.json({ success: true, summary });
});

// GET /api/analytics/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/revenue', (req, res) => {
  const { start, end } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const data = getRevenueByDateRange(start || sevenDaysAgo, end || today);
  res.json({ success: true, data });
});

// GET /api/analytics/top-items?limit=10&days=7
router.get('/top-items', (req, res) => {
  const { limit, days } = req.query;
  const items = getTopItems(parseInt(limit) || 10, parseInt(days) || 7);
  res.json({ success: true, items });
});

// GET /api/analytics/payments?days=30
router.get('/payments', (req, res) => {
  const { days } = req.query;
  const data = getPaymentMethodBreakdown(parseInt(days) || 30);
  res.json({ success: true, data });
});

module.exports = router;
