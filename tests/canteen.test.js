'use strict';

process.env.NODE_ENV = 'test';

const { initDb, getDb } = require('../server/db');
const { deductStock, restoreStockForOrder, adjustStock } = require('../server/services/StockService');
const { processCashPayment } = require('../server/services/PaymentService');
const { generateToken } = require('../server/services/TokenService');

let teaId;
let lowStockId;

beforeAll(async () => {
  await initDb();
  const db = getDb();
  const r1 = db.prepare("INSERT INTO food_items (name, price, stock, is_available) VALUES ('Tea', 10, 100, 1)").run();
  teaId = r1.lastInsertRowid;
  const r2 = db.prepare("INSERT INTO food_items (name, price, stock, is_available) VALUES ('LowStock', 5, 1, 1)").run();
  lowStockId = r2.lastInsertRowid;
});

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
    const beforeTea = db.prepare("SELECT stock FROM food_items WHERE id = ?").get(teaId).stock;

    const result = deductStock([
      { foodItemId: 1, quantity: 2 },
      { foodItemId: teaId, quantity: 5 },
    ], 'ONLINE_ORDER');

    expect(result.success).toBe(true);
    const afterSamosa = db.prepare("SELECT stock FROM food_items WHERE name='Samosa'").get().stock;
    const afterTea = db.prepare("SELECT stock FROM food_items WHERE id = ?").get(teaId).stock;
    expect(afterSamosa).toBe(beforeSamosa - 2);
    expect(afterTea).toBe(beforeTea - 5);
  });

  test('rejects when stock is insufficient', () => {
    const result = deductStock([{ foodItemId: lowStockId, quantity: 2 }], 'COUNTER_ORDER');
    expect(result.success).toBe(false);
    expect(result.message).toContain('1');
  });

  test('never results in negative stock', () => {
    const db = getDb();
    deductStock([{ foodItemId: lowStockId, quantity: 1 }], 'COUNTER_ORDER');
    const stock = db.prepare("SELECT stock FROM food_items WHERE id = ?").get(lowStockId).stock;
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
    const testOrderNum = `TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, stock_deducted, status)
      VALUES (?, 'COUNTER', 'STUDENT', 'CASH', 15, 1, 'CANCELLED')
    `).run(testOrderNum);

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
      INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, amount_paise, status, stock_deducted)
      VALUES (?,  'COUNTER', 'STUDENT', 'CASH', 85, 8500, 'PENDING', 1)
    `).run(`PAY-TEST-${Date.now()}-${Math.floor(Math.random()*1000)}`);
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
    const orderNum = `C-SRC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total)
      VALUES (?, 'COUNTER', 'VISITOR', 'CASH', 45)`).run(orderNum);
    const order = db.prepare("SELECT order_source FROM orders WHERE order_number = ?").get(orderNum);
    expect(order.order_source).toBe('COUNTER');
  });

  test('online orders have ONLINE source', () => {
    const db = getDb();
    const orderNum = `O-SRC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total)
      VALUES (?, 'ONLINE', 'ONLINE', 'UPI', 55)`).run(orderNum);
    const order = db.prepare("SELECT order_source FROM orders WHERE order_number = ?").get(orderNum);
    expect(order.order_source).toBe('ONLINE');
  });

  test('analytics can distinguish online vs counter revenue', () => {
    const db = getDb();
    const cNum = `C-ANA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const oNum = `O-ANA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    // Insert paid orders for both sources
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, payment_status) VALUES (?,'COUNTER','STUDENT','CASH',100,'PAID')`).run(cNum);
    db.prepare(`INSERT INTO orders (order_number, order_source, customer_type, payment_method, total, payment_status) VALUES (?,'ONLINE','ONLINE','UPI',200,'PAID')`).run(oNum);

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
