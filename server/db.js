'use strict';

/**
 * db.js — SQLite using sql.js (pure WebAssembly, zero native compilation).
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'canteen.db.bin');

let adapter = null;
let rawSqlJsDb = null;
let inTransaction = false;  // Track transaction state to prevent nested saves

function saveToDisk() {
  if (!rawSqlJsDb || inTransaction) return;
  try {
    const data = rawSqlJsDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    // Non-fatal — data is still in memory
  }
}

/**
 * Bind params, converting undefined → null and handling arrays correctly.
 */
function bindParams(params) {
  return params.map(p => (p === undefined ? null : p));
}

/**
 * Execute a single SQL query and return all result rows as objects.
 * Utility used internally.
 */
function execQuery(sqlDb, sql, params = []) {
  const stmt = sqlDb.prepare(sql);
  stmt.bind(bindParams(params));
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/**
 * Get the last inserted row ID.
 */
function lastRowId(sqlDb) {
  const res = sqlDb.exec('SELECT last_insert_rowid() as id');
  return res[0]?.values[0]?.[0] ?? null;
}

/**
 * Create a better-sqlite3-compatible synchronous adapter over sql.js.
 */
function createAdapter(sqlDb) {
  rawSqlJsDb = sqlDb;

  return {
    exec(sql) {
      sqlDb.run(sql);
      saveToDisk();
      return this;
    },

    prepare(sql) {
      return {
        run(...params) {
          const stmt = sqlDb.prepare(sql);
          stmt.run(bindParams(params));
          stmt.free();
          const id = lastRowId(sqlDb);
          if (!inTransaction) saveToDisk();
          return { lastInsertRowid: id, changes: sqlDb.getRowsModified() };
        },

        get(...params) {
          const rows = execQuery(sqlDb, sql, params);
          return rows[0] ?? null;
        },

        all(...params) {
          return execQuery(sqlDb, sql, params);
        },
      };
    },

    /**
     * Wraps fn in a SQLite transaction.
     * Mirrors better-sqlite3's db.transaction(fn)(...args) pattern.
     */
    transaction(fn) {
      return (...args) => {
        if (inTransaction) {
          // Already inside a transaction — just run fn directly (no nesting)
          return fn(...args);
        }

        inTransaction = true;
        sqlDb.run('BEGIN');
        try {
          const result = fn(...args);
          sqlDb.run('COMMIT');
          inTransaction = false;
          saveToDisk();
          return result;
        } catch (err) {
          inTransaction = false;
          try { sqlDb.run('ROLLBACK'); } catch (_) {}
          throw err;
        }
      };
    },

    pragma(str) {
      try { sqlDb.run(`PRAGMA ${str}`); } catch (_) {}
      return this;
    },
  };
}

async function initDb() {
  if (adapter) return adapter;

  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileData = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileData);
  } else {
    sqlDb = new SQL.Database();
  }

  adapter = createAdapter(sqlDb);
  adapter.pragma('foreign_keys = ON');
  initSchema();
  return adapter;
}

function getDb() {
  if (!adapter) throw new Error('DB not initialized. Await initDb() first.');
  return adapter;
}

function initSchema() {
  const db = adapter;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CUSTOMER',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS food_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_emoji TEXT NOT NULL DEFAULT '🍽️',
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      token_number TEXT,
      order_source TEXT NOT NULL DEFAULT 'ONLINE',
      customer_type TEXT NOT NULL DEFAULT 'ONLINE',
      customer_name TEXT,
      customer_mobile TEXT,
      customer_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payment_method TEXT NOT NULL DEFAULT 'UPI',
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      amount_paise INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_admin_id INTEGER,
      stock_deducted INTEGER NOT NULL DEFAULT 0,
      cancelled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      food_item_id INTEGER,
      food_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_price_paise INTEGER NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      subtotal_paise INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'CASH',
      provider_order_id TEXT,
      provider_payment_id TEXT,
      method TEXT NOT NULL,
      amount_paise INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      amount_due REAL NOT NULL DEFAULT 0,
      amount_received REAL,
      change_amount REAL NOT NULL DEFAULT 0,
      cashier_id INTEGER,
      signature_verified INTEGER NOT NULL DEFAULT 0,
      webhook_verified INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      idempotency_key TEXT,
      transaction_ref TEXT,
      upi_qr_data TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      used_at TEXT,
      used_by_admin_id INTEGER,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'RAZORPAY',
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PROCESSED',
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stock_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_item_id INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id INTEGER,
      admin_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Run column migrations for existing SQLite databases
  try {
    const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
    if (!orderCols.includes('amount_paise')) {
      db.exec("ALTER TABLE orders ADD COLUMN amount_paise INTEGER NOT NULL DEFAULT 0");
    }
  } catch (_) {}

  try {
    const itemCols = db.prepare("PRAGMA table_info(order_items)").all().map(c => c.name);
    if (!itemCols.includes('unit_price_paise')) {
      db.exec("ALTER TABLE order_items ADD COLUMN unit_price_paise INTEGER NOT NULL DEFAULT 0");
    }
    if (!itemCols.includes('subtotal_paise')) {
      db.exec("ALTER TABLE order_items ADD COLUMN subtotal_paise INTEGER NOT NULL DEFAULT 0");
    }
  } catch (_) {}

  try {
    const paymentCols = db.prepare("PRAGMA table_info(payments)").all().map(c => c.name);
    if (!paymentCols.includes('provider')) {
      db.exec("ALTER TABLE payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'CASH'");
    }
    if (!paymentCols.includes('provider_order_id')) {
      db.exec("ALTER TABLE payments ADD COLUMN provider_order_id TEXT");
    }
    if (!paymentCols.includes('provider_payment_id')) {
      db.exec("ALTER TABLE payments ADD COLUMN provider_payment_id TEXT");
    }
    if (!paymentCols.includes('amount_paise')) {
      db.exec("ALTER TABLE payments ADD COLUMN amount_paise INTEGER NOT NULL DEFAULT 0");
    }
    if (!paymentCols.includes('currency')) {
      db.exec("ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'");
    }
    if (!paymentCols.includes('signature_verified')) {
      db.exec("ALTER TABLE payments ADD COLUMN signature_verified INTEGER NOT NULL DEFAULT 0");
    }
    if (!paymentCols.includes('webhook_verified')) {
      db.exec("ALTER TABLE payments ADD COLUMN webhook_verified INTEGER NOT NULL DEFAULT 0");
    }
    if (!paymentCols.includes('verified_at')) {
      db.exec("ALTER TABLE payments ADD COLUMN verified_at TEXT");
    }
    if (!paymentCols.includes('idempotency_key')) {
      db.exec("ALTER TABLE payments ADD COLUMN idempotency_key TEXT");
    }
  } catch (_) {}

  // Create indexes after columns exist
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_provider_payment ON payments(provider_payment_id);
      CREATE INDEX IF NOT EXISTS idx_qr_tokens_hash ON qr_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_qr_tokens_order ON qr_tokens(order_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_id ON webhook_events(event_id);
    `);
  } catch (_) {}


  seedData();
}

function seedData() {
  const db = adapter;
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return;

  const adminHash = bcrypt.hashSync('admin123', 10);
  const staffHash = bcrypt.hashSync('staff123', 10);

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Super Admin',   'admin@canteen.com', adminHash, 'ADMIN');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Cashier Ravi',  'ravi@canteen.com',  staffHash, 'STAFF');

  const cats = [['Snacks', 1], ['Meals', 2], ['Beverages', 3], ['Sweets', 4]];
  cats.forEach(([name, sort]) => db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, sort));

  const snacks = db.prepare("SELECT id FROM categories WHERE name='Snacks'").get().id;
  const meals  = db.prepare("SELECT id FROM categories WHERE name='Meals'").get().id;
  const bev    = db.prepare("SELECT id FROM categories WHERE name='Beverages'").get().id;
  const sweets = db.prepare("SELECT id FROM categories WHERE name='Sweets'").get().id;

  const items = [
    [snacks, 'Samosa',         15,  100, '🥟'],
    [snacks, 'Bread Pakora',   20,  80,  '🥪'],
    [snacks, 'Vada Pav',       25,  60,  '🍔'],
    [snacks, 'Aloo Tikki',     20,  70,  '🫓'],
    [meals,  'Chole Rice',     55,  40,  '🍛'],
    [meals,  'Dal Khichdi',    45,  35,  '🍲'],
    [meals,  'Paneer Paratha', 50,  50,  '🫔'],
    [meals,  'Veg Pulao',      60,  30,  '🍚'],
    [bev,    'Masala Chai',    10,  200, '☕'],
    [bev,    'Cold Coffee',    30,  80,  '🧋'],
    [bev,    'Lemonade',       20,  150, '🍋'],
    [bev,    'Mango Lassi',    35,  60,  '🥤'],
    [sweets, 'Gulab Jamun',    25,  90,  '🍮'],
    [sweets, 'Jalebi',         20,  75,  '🌀'],
    [sweets, 'Kheer',          30,  50,  '🍨'],
  ];

  items.forEach(([cat, name, price, stock, emoji]) => {
    const r = db.prepare('INSERT INTO food_items (category_id, name, price, stock, image_emoji) VALUES (?, ?, ?, ?, ?)').run(cat, name, price, stock, emoji);
    db.prepare("INSERT INTO stock_history (food_item_id, previous_stock, change_amount, new_stock, reason, note) VALUES (?, 0, ?, ?, 'INITIAL', 'Seed stock')").run(r.lastInsertRowid, stock, stock);
  });

  saveToDisk();
  console.log('✅ Database seeded with 15 food items, 4 categories, 2 admin users');
}

module.exports = { initDb, getDb };
