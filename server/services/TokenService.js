'use strict';

const { getDb } = require('../db');

/**
 * TokenService — generates short human-readable tokens.
 * Format: A-27 (prefix + daily sequence number)
 * Resets each calendar day.
 */

const PREFIXES = ['A', 'B', 'C', 'D', 'E'];

function generateToken(orderId) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Count orders created today to get sequence number
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE DATE(created_at) = DATE('now')
    AND token_number IS NOT NULL
  `).get();

  const seq = (row.c % 99) + 1; // 1–99 range
  const prefix = PREFIXES[Math.floor(row.c / 99) % PREFIXES.length];
  const token = `${prefix}-${seq}`;

  return token;
}

module.exports = { generateToken };
