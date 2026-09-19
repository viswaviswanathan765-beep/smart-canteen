# 🍽️ Smart Canteen

A complete canteen management system supporting both **Online Self-Ordering** and **Admin-Assisted Counter Ordering** — all using the same database, inventory, and order engine.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd smart-canteen
npm install
```

### 2. Start the server
```bash
npm run dev
```

### 3. Open the apps
| URL | Description |
|-----|-------------|
| http://localhost:3000 | Customer self-order app |
| http://localhost:3000/admin.html | Admin dashboard + POS |

---

## 🔑 Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@canteen.com | admin123 |
| Staff | ravi@canteen.com | staff123 |

---

## 🏗️ Architecture

```
server/
├── index.js            # Express entry point
├── db.js               # SQLite schema + seed data
├── middleware/
│   ├── auth.js         # JWT authentication
│   └── roles.js        # Role-based access control
├── services/
│   ├── OrderService.js    # Unified order engine (online + counter)
│   ├── StockService.js    # Atomic stock management
│   ├── PaymentService.js  # Cash + UPI payments
│   ├── TokenService.js    # A-27 style token generation
│   ├── QRService.js       # QR code generation
│   └── AnalyticsService.js
└── routes/
    ├── auth.js, menu.js, orders.js
    ├── counter.js      # Counter-only routes (staff+ auth)
    ├── stock.js, analytics.js

public/
├── index.html          # Customer PWA
├── admin.html          # Admin dashboard
├── css/main.css, admin.css, counter-pos.css
└── js/api.js, admin.js, counter-pos.js
```

---

## 📋 API Endpoints

### Auth
```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Menu (Public)
```
GET  /api/menu
POST /api/menu/stock-check
```

### Online Orders
```
POST /api/orders
GET  /api/orders/track/:orderNumber
POST /api/orders/:id/pay/upi
POST /api/orders/:id/pay/upi/verify
```

### Counter Orders (STAFF+ only)
```
POST /api/counter/stock-check
POST /api/counter/orders
POST /api/counter/orders/:id/pay/cash
POST /api/counter/orders/:id/pay/upi/generate
POST /api/counter/orders/:id/pay/upi/verify
PUT  /api/counter/orders/:id/status
```

### Admin
```
GET  /api/orders                # All orders with filters
PUT  /api/orders/:id/status
POST /api/orders/:id/cancel
GET  /api/orders/pickup/board
GET  /api/stock
PUT  /api/stock/:id             # ADMIN only
GET  /api/stock/:id/history
GET  /api/analytics/summary
GET  /api/analytics/revenue
GET  /api/analytics/top-items
```

---

## ⚡ Key Features

### Counter POS
- Full-screen split layout (menu grid + cart)
- Category tabs + search
- Large touch-friendly food cards
- Customer type selection (Student/Staff/Parent/Visitor)
- Optional customer name/mobile
- Cash payment with automatic change calculation
- UPI QR code generation
- Real-time stock validation before submission
- Receipt display with print support
- Token generation (A-27 format)

### Inventory
- **Single unified inventory** — online and counter deduct from same stock
- **Atomic transactions** — impossible to oversell
- **Idempotent cancellation** — stock restored exactly once via `stock_deducted` flag
- Full stock history audit trail with reason codes

### Analytics
- Today's revenue: Online vs Counter breakdown
- Top-selling items (last 7 days)
- Payment method breakdown
- Filterable orders by source, status, date, payment

---

## 🧪 Running Tests
```bash
npm test
```

Tests cover:
- Atomic stock deduction
- Insufficient stock rejection
- No negative stock guarantee
- Idempotent cancellation (stock restored exactly once)
- Cash change calculation
- Double payment rejection
- Token format validation
- Order source distinction for analytics

---

## 🗄️ Database

SQLite database is stored at `canteen.db` in the project root.

### Tables
- `users` — Admin/staff accounts
- `categories` — Food categories
- `food_items` — Menu items with stock
- `orders` — All orders (online + counter, same table)
- `order_items` — Line items per order
- `payments` — Payment audit trail
- `stock_history` — Every stock change logged

### order_source values
- `ONLINE` — Customer self-ordered via website
- `COUNTER` — Admin-assisted at the counter

---

## 🔐 Security

- JWT tokens (httpOnly cookies)
- All counter order endpoints require STAFF or ADMIN role
- Every counter order records `created_by_admin_id`
- Cash payments record `cashier_id` and timestamp
- Server-side stock validation before every order

---

## 📱 Manual Testing Checklist

- [ ] Admin login works
- [ ] Dashboard shows today's stats
- [ ] "+ New Counter Order" opens POS full-screen
- [ ] Food items load in POS with categories
- [ ] Selecting customer type highlights the button
- [ ] Adding item to cart shows quantity badge
- [ ] Cannot add more than available stock
- [ ] Cash payment calculates change correctly
- [ ] Cannot confirm if received < total
- [ ] Order created → token displayed (A-XX format)
- [ ] Receipt shows all items, total, change
- [ ] Receipt is printable
- [ ] "New Order" clears POS for next customer
- [ ] Online customer can order via index.html
- [ ] Stock decrements for both order types
- [ ] Analytics shows online vs counter split
- [ ] Pickup board shows token + status
- [ ] Mark Completed works
- [ ] Cancel order restores stock
- [ ] Cancelling twice does NOT restore stock twice
- [ ] Unauthorized access to /api/counter/* returns 403

---

## 📦 Seed Data

15 food items across 4 categories:
- **Snacks**: Samosa (₹15), Bread Pakora (₹20), Vada Pav (₹25), Aloo Tikki (₹20)
- **Meals**: Chole Rice (₹55), Dal Khichdi (₹45), Paneer Paratha (₹50), Veg Pulao (₹60)
- **Beverages**: Masala Chai (₹10), Cold Coffee (₹30), Lemonade (₹20), Mango Lassi (₹35)
- **Sweets**: Gulab Jamun (₹25), Jalebi (₹20), Kheer (₹30)
