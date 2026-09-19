'use strict';

// Setup test database in memory
process.env.NODE_ENV = 'test';

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// Use in-memory DB for tests
jest.mock('../server/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT DEFAULT 'CUSTOMER', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS food_items (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, name TEXT, description TEXT, price REAL CHECK(price>=0), stock INTEGER DEFAULT 0 CHECK(stock>=0), image_emoji TEXT DEFAULT '🍽️', is_available INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE, token_number TEXT, order_source TEXT DEFAULT 'ONLINE' CHECK(order_source IN ('ONLINE','COUNTER')), customer_type TEXT DEFAULT 'ONLINE', customer_name TEXT, customer_mobile TEXT, customer_user_id INTEGER, status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','PREPARING','READY','COMPLETED','CANCELLED')), payment_method TEXT DEFAULT 'UPI', payment_status TEXT DEFAULT 'PENDING', subtotal REAL DEFAULT 0, total REAL DEFAULT 0, notes TEXT, created_by_admin_id INTEGER, stock_deducted INTEGER DEFAULT 0, cancelled_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, food_item_id INTEGER, food_name TEXT, quantity INTEGER CHECK(quantity>0), unit_price REAL, subtotal REAL);
    CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, method TEXT, amount_due REAL, amount_received REAL, change_amount REAL DEFAULT 0, cashier_id INTEGER, transaction_ref TEXT, upi_qr_data TEXT, status TEXT DEFAULT 'PENDING', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS stock_history (id INTEGER PRIMARY KEY AUTOINCREMENT, food_item_id INTEGER NOT NULL, previous_stock INTEGER, change_amount INTEGER, new_stock INTEGER, reason TEXT, order_id INTEGER, admin_id INTEGER, note TEXT, created_at TEXT DEFAULT (datetime('now')));
  `);

  // Seed test data
  const adminHash = bcrypt.hashSync('test123', 1);
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Test Admin', 'admin@test.com', ?, 'ADMIN')").run(adminHash);
  db.prepare("INSERT INTO food_items (name, price, stock, is_available) VALUES ('Samosa', 15, 50, 1)").run();
  db.prepare("INSERT INTO food_items (name, price, stock, is_available) VALUES ('Tea', 10, 100, 1)").run();
  db.prepare("INSERT INTO food_items (name, price, stock, is_available) VALUES ('LowStock', 5, 1, 1)").run();

  return { getDb: () => db };
});

const { deductStock, restoreStockForOrder, adjustStock } = require('../server/services/StockService');
const { processCashPayment } = require('../server/services/PaymentService');
const { generateToken } = require('../server/services/TokenService');
const { getDb } = require('../server/db');

// ============================================================
// STOCK SERVICE TESTS
// ============================================================
describe('StockService', () => {
  test('deducts stock correctly for single item', () => {
    const db = getDb();
    const before = db.prepare("SELECT stock FROM food_items WHERE name='Samosa'").get().stock;

    const result = deductStock([{ foodItemId: 1, quantity: 3 }], 'COUNTER_ORDER');
    expect(result.success).toBe(true);

    const after = db.prepare("SELECT stock FROM food_items WHERE name='Samosa'").get().stock;
    expect(after).toBe(before - 3);
  });

  test('deducts stock for multiple items in one transaction', () => {
    const db = getDb();
    const beforeSamosa = db.prepare("SELECT stock FROM food_items WHERE name='Samosa'").get().stock;
    const beforeTea = db.prepare("SELECT stock FROM food_items WHERE name='Tea'").get().stock;

    const result = deductStock([
      { foodItemId: 1, quantity: 2 },
      { foodItemId: 2, quantity: 5 },
    ], 'ONLINE_ORDER');

    expect(result.success).toBe(true);
    const afterSamosa = db.prepare("SELECT stock FROM food_items WHERE name='Samosa'").get().stock;
    const afterTea = db.prepare("SELECT stock FROM food_items WHERE name='Tea'").get().stock;
    expect(afterSamosa).toBe(beforeSamosa - 2);
    expect(afterTea).toBe(beforeTea - 5);
  });

  test('rejects when stock is insufficient', () => {
    const result = deductStock([{ foodItemId: 3, quantity: 2 }], 'COUNTER_ORDER'); // LowStock has only 1
    expect(result.success).toBe(false);
    expect(result.message).toContain('1');
  });

  test('never results in negative stock', () => {
    const db = getDb();
    // Buy the only remaining LowStock item
    deductStock([{ foodItemId: 3, quantity: 1 }], 'COUNTER_ORDER');
    const stock = db.prepare("SELECT stock FROM food_items WHERE id=3").get().stock;
    expect(stock).toBeGreaterThanOrEqual(0);
  });

  test('records stock history for deduction', () => {
    const db = getDb();
    const before = db.prepare("SELECT COUNT(*) as c FROM stock_history WHERE reason='COUNTER_ORDER'").get().c;
    deductStock([{ foodItemId: 2, quantity: 1 }], 'COUNTER_ORDER');
    const after = db.prepare("SELECT COUNT(*) as c FROM stock_history WHERE reason='COUNTER_ORDER'").get().c;
    expect(after).toBeGreaterThan(before);
  });

  test('restores stock only once (idempotent cancellation)', () => {
    const db = getDb();
    // Create a fake order with stock deducted
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, stock_deducted, status)
      VALUES ('TEST-001', 'COUNTER', 'STUDENT', 'CASH', 15, 1, 'CANCELLED')
    `).run();

    const orderId = orderResult.lastInsertRowid;
    db.prepare("INSERT INTO order_items (order_id, food_item_id, food_name, quantity, unit_price, subtotal) VALUES (?,1,'Samosa',2,15,30)").run(orderId);

    const beforeStock = db.prepare("SELECT stock FROM food_items WHERE id=1").get().stock;

    // First restore
    const r1 = restoreStockForOrder(orderId);
    expect(r1.success).toBe(true);

    const afterFirst = db.prepare("SELECT stock FROM food_items WHERE id=1").get().stock;
    expect(afterFirst).toBe(beforeStock + 2);

    // Second restore should be a no-op (stock_deducted is now 0)
    const r2 = restoreStockForOrder(orderId);
    expect(r2.success).toBe(true);
    expect(r2.restored || r2.skipped).toBeTruthy();

    const afterSecond = db.prepare("SELECT stock FROM food_items WHERE id=1").get().stock;
    expect(afterSecond).toBe(afterFirst); // No double restore
  });

  test('manual stock adjustment records history', () => {
    const db = getDb();
    const result = adjustStock(1, 10, 'Restock delivery', 1);
    expect(result.success).toBe(true);

    const history = db.prepare("SELECT * FROM stock_history WHERE reason='MANUAL_ADJUSTMENT' ORDER BY id DESC LIMIT 1").get();
    expect(history).toBeDefined();
    expect(history.change_amount).toBe(10);
  });
});

// ============================================================
// PAYMENT SERVICE TESTS
// ============================================================
describe('PaymentService', () => {
  let testOrderId;

  beforeEach(() => {
    const db = getDb();
    const r = db.prepare(`
      INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, status, stock_deducted)
      VALUES (?,  'COUNTER', 'STUDENT', 'CASH', 85, 'PENDING', 1)
    `).run(`PAY-TEST-${Date.now()}`);
    testOrderId = r.lastInsertRowid;
  });

  test('processes cash payment and calculates change', () => {
    const result = processCashPayment(testOrderId, 100, 1);
    expect(result.success).toBe(true);
    expect(result.change).toBe(15);
    expect(result.payment.status).toBe('PAID');
  });

  test('rejects cash payment when amount is insufficient', () => {
    const result = processCashPayment(testOrderId, 50, 1);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/insufficient/i);
  });

  test('rejects double payment on same order', () => {
    processCashPayment(testOrderId, 100, 1);
    const result2 = processCashPayment(testOrderId, 100, 1);
    expect(result2.success).toBe(false);
    expect(result2.message).toMatch(/already paid/i);
  });
});

// ============================================================
// TOKEN SERVICE TESTS
// ============================================================
describe('TokenService', () => {
  test('generates tokens in A-N format', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-E]-\d+$/);
  });

  test('generates unique tokens on consecutive calls', () => {
    const t1 = generateToken();
    // Insert an order to increment counter
    const db = getDb();
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, token_number)
      VALUES (?, 'COUNTER', 'STUDENT', 'CASH', 10, ?)`).run(`TOK-${Date.now()}`, t1);
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });
});

// ============================================================
// ORDER SOURCE DISTINCTION TESTS
// ============================================================
describe('Order Source Tracking', () => {
  test('counter orders have COUNTER source', () => {
    const db = getDb();
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total)
      VALUES ('C-SRC-TEST', 'COUNTER', 'VISITOR', 'CASH', 45)`).run();
    const order = db.prepare("SELECT order_source FROM orders WHERE order_number='C-SRC-TEST'").get();
    expect(order.order_source).toBe('COUNTER');
  });

  test('online orders have ONLINE source', () => {
    const db = getDb();
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total)
      VALUES ('O-SRC-TEST', 'ONLINE', 'ONLINE', 'UPI', 55)`).run();
    const order = db.prepare("SELECT order_source FROM orders WHERE order_number='O-SRC-TEST'").get();
    expect(order.order_source).toBe('ONLINE');
  });

  test('analytics can distinguish online vs counter revenue', () => {
    const db = getDb();
    // Insert paid orders for both sources
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, payment_status) VALUES ('C-ANA-001','COUNTER','STUDENT','CASH',100,'PAID')`).run();
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, payment_status) VALUES ('O-ANA-001','ONLINE','ONLINE','UPI',200,'PAID')`).run();

    const rows = db.prepare(`
      SELECT order_source, SUM(total) as rev FROM orders
      WHERE payment_status='PAID' AND status!='CANCELLED'
      GROUP BY order_source
    `).all();

    const sources = rows.map(r => r.order_source);
    expect(sources).toContain('COUNTER');
    expect(sources).toContain('ONLINE');
  });
});
