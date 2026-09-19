/* =============================================
   SMART CANTEEN — Admin Dashboard (admin.js)
   ============================================= */

const AdminApp = {
  user: null,
  currentSection: 'dashboard',
  scannerInstance: null,
  scannerActive: false,
  scannerFacingMode: 'environment',
  recentScans: [],

  async init() {
    const result = await API.me();
    if (!result.success) {
      this.showLoginScreen();
      return;
    }

    this.user = result.user;
    this.showAdminUI();
    this.navigate('dashboard');
  },

  // ---- Auth ----
  showLoginScreen() {
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">🍽️</div>
          <div class="login-title">Smart Canteen</div>
          <div class="login-subtitle">Admin & Staff Portal</div>
          <form onsubmit="AdminApp.login(event)">
            <div class="form-group mb-3">
              <label class="form-label">Email</label>
              <input type="email" id="login-email" class="form-control form-control-lg"
                     placeholder="admin@canteen.com" value="admin@canteen.com" required>
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Password</label>
              <input type="password" id="login-password" class="form-control form-control-lg"
                     placeholder="••••••••" value="admin123" required>
            </div>
            <div id="login-error" style="color:var(--danger);font-size:0.85rem;margin-bottom:12px;"></div>
            <button type="submit" class="btn btn-primary btn-full btn-lg" id="login-btn">
              Sign In
            </button>
          </form>
          <div class="mt-3 text-center text-small text-muted">
            Staff: ravi@canteen.com / staff123
          </div>
        </div>
      </div>
    `;
  },

  async login(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const result = await API.login(email, password);

    if (!result.success) {
      document.getElementById('login-error').textContent = result.message || 'Login failed';
      btn.innerHTML = 'Sign In';
      btn.disabled = false;
      return;
    }

    this.user = result.user;
    this.showAdminUI();
    this.navigate('dashboard');
  },

  async logout() {
    await API.logout();
    this.user = null;
    this.showLoginScreen();
  },

  // ---- Admin UI shell ----
  showAdminUI() {
    document.getElementById('app').innerHTML = `
      <div class="admin-layout">
        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            <div class="brand-logo">🍽️ Smart Canteen</div>
            <div class="brand-subtitle">Admin Panel</div>
          </div>

          <button class="btn-counter-order" onclick="POS.open()" id="btn-new-counter-order">
            <span>🏪</span> + New Counter Order
          </button>
          <button class="btn btn-outline btn-full" onclick="AdminApp.openQRScannerModal()" id="btn-sidebar-scan-qr" style="margin-top:6px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:0.85rem;background:var(--bg-elevated);border:1px solid var(--border-accent);color:var(--text-primary);padding:9px 12px;border-radius:var(--radius-md)">
            <span>📷</span> Scan Pickup QR
          </button>

          <nav class="sidebar-nav">
            <div class="nav-section-label">Overview</div>
            <div class="nav-item active" id="nav-dashboard" onclick="AdminApp.navigate('dashboard')">
              <span class="nav-icon">📊</span> Dashboard
            </div>

            <div class="nav-section-label">Orders</div>
            <div class="nav-item" id="nav-scan-qr" onclick="AdminApp.navigate('scan-qr')">
              <span class="nav-icon">📷</span> Scan QR / Pickup
            </div>
            <div class="nav-item" id="nav-all-orders" onclick="AdminApp.navigate('all-orders')">
              <span class="nav-icon">📋</span> All Orders
            </div>
            <div class="nav-item" id="nav-counter-orders" onclick="AdminApp.navigate('counter-orders')">
              <span class="nav-icon">🏪</span> Counter Orders
            </div>
            <div class="nav-item" id="nav-pickup" onclick="AdminApp.navigate('pickup')">
              <span class="nav-icon">🔔</span> Pickup Board
              <span class="nav-badge" id="pickup-badge" style="display:none">0</span>
            </div>

            <div class="nav-section-label">Inventory</div>
            <div class="nav-item" id="nav-menu" onclick="AdminApp.navigate('menu')">
              <span class="nav-icon">🍔</span> Manage Menu
            </div>
            <div class="nav-item" id="nav-stock" onclick="AdminApp.navigate('stock')">
              <span class="nav-icon">📦</span> Stock
            </div>

            <div class="nav-section-label">Reports & Finance</div>
            <div class="nav-item" id="nav-analytics" onclick="AdminApp.navigate('analytics')">
              <span class="nav-icon">💰</span> Analytics
            </div>
            <div class="nav-item" id="nav-payments" onclick="AdminApp.navigate('payments')">
              <span class="nav-icon">💳</span> Payments Audit
            </div>
          </nav>

          <div class="sidebar-footer">
            <div class="user-info">
              <div class="user-avatar">${(this.user.name || 'A').charAt(0).toUpperCase()}</div>
              <div>
                <div class="user-name">${escHtml(this.user.name)}</div>
                <div class="user-role">${this.user.role}</div>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="AdminApp.logout()" title="Logout" style="margin-left:auto">⏏</button>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
          <div class="topbar">
            <div class="topbar-title" id="topbar-title">Dashboard</div>
            <div class="flex gap-2">
              <button class="btn btn-outline btn-sm" onclick="AdminApp.openQRScannerModal()" id="btn-topbar-scan">
                📷 Scan Customer QR
              </button>
              <button class="btn btn-primary btn-sm" onclick="POS.open()">🏪 New Counter Order</button>
            </div>
          </div>
          <div class="page-content" id="page-content">
            <div class="flex items-center justify-center" style="height:300px">
              <span class="spinner" style="width:40px;height:40px"></span>
            </div>
          </div>
        </main>
      </div>

      <!-- POS Overlay -->
      ${this.renderPOSOverlay()}
    `;

    // Start pickup badge refresh
    this.refreshPickupBadge();
    setInterval(() => this.refreshPickupBadge(), 30000);
  },

  navigate(section) {
    this.stopCameraScanner();
    this.currentSection = section;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById(`nav-${section}`);
    if (navEl) navEl.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      'scan-qr': '📷 Customer QR Scanner & Pickup Verification',
      'all-orders': 'All Orders',
      'counter-orders': 'Counter Orders',
      pickup: 'Pickup Board',
      menu: 'Manage Menu',
      stock: 'Stock Management',
      analytics: 'Analytics',
      payments: 'Payments & Transactions Audit',
    };
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = titles[section] || section;

    const sections = {
      dashboard:       () => this.loadDashboard(),
      'scan-qr':       () => this.loadScanQR(),
      'all-orders':    () => this.loadAllOrders(),
      'counter-orders':() => this.loadCounterOrders(),
      pickup:          () => this.loadPickupBoard(),
      menu:            () => this.loadMenu(),
      stock:           () => this.loadStock(),
      analytics:       () => this.loadAnalytics(),
      payments:        () => this.loadPayments(),
    };

    if (sections[section]) sections[section]();
  },

  setContent(html) {
    const el = document.getElementById('page-content');
    if (el) el.innerHTML = html;
  },

  // ---- Dashboard ----
  async loadDashboard() {
    const result = await API.analytics();
    const today = result.success ? result.summary : {};

    const online  = today.online  || { order_count: 0, revenue: 0 };
    const counter = today.counter || { order_count: 0, revenue: 0 };
    const total   = today.total   || { order_count: 0, revenue: 0 };

    this.setContent(`
      <div class="stats-grid">
        <div class="stat-card" style="--stat-color: var(--success)">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Today's Revenue</div>
          <div class="stat-value">${formatCurrency(total.revenue)}</div>
          <div class="stat-subvalue">${total.order_count} orders</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--info)">
          <div class="stat-icon">🌐</div>
          <div class="stat-label">Online Sales</div>
          <div class="stat-value">${formatCurrency(online.revenue)}</div>
          <div class="stat-subvalue">${online.order_count} orders</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--accent)">
          <div class="stat-icon">🏪</div>
          <div class="stat-label">Counter Sales</div>
          <div class="stat-value">${formatCurrency(counter.revenue)}</div>
          <div class="stat-subvalue">${counter.order_count} orders</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--primary)">
          <div class="stat-icon">📋</div>
          <div class="stat-label">Total Orders</div>
          <div class="stat-value">${total.order_count}</div>
          <div class="stat-subvalue">Today</div>
        </div>
      </div>

      <h3 style="margin-bottom:12px;font-size:1rem">Quick Actions</h3>
      <div class="quick-actions">
        <div class="quick-action primary-action" onclick="POS.open()">
          <div class="quick-action-icon">🏪</div>
          <div class="quick-action-label">New Counter Order</div>
        </div>
        <div class="quick-action" onclick="AdminApp.navigate('pickup')">
          <div class="quick-action-icon">🔔</div>
          <div class="quick-action-label">Pickup Board</div>
        </div>
        <div class="quick-action" onclick="AdminApp.navigate('all-orders')">
          <div class="quick-action-icon">📋</div>
          <div class="quick-action-label">View Orders</div>
        </div>
        <div class="quick-action" onclick="AdminApp.navigate('menu')">
          <div class="quick-action-icon">🍔</div>
          <div class="quick-action-label">Manage Food</div>
        </div>
        <div class="quick-action" onclick="AdminApp.navigate('stock')">
          <div class="quick-action-icon">📦</div>
          <div class="quick-action-label">Manage Stock</div>
        </div>
        <div class="quick-action" onclick="AdminApp.navigate('analytics')">
          <div class="quick-action-icon">📊</div>
          <div class="quick-action-label">Analytics</div>
        </div>
      </div>

      <h3 style="margin:24px 0 12px;font-size:1rem">Recent Orders</h3>
      <div id="recent-orders-wrap">Loading...</div>
    `);

    // Load recent orders
    const ordersResult = await API.getOrders({ limit: 10 });
    const wrap = document.getElementById('recent-orders-wrap');
    if (wrap && ordersResult.success) {
      wrap.innerHTML = this.renderOrdersTable(ordersResult.orders);
    }
  },

  // ---- All Orders ----
  async loadAllOrders(filters = {}) {
    this.setContent(`
      <div class="orders-table-wrap">
        <div class="table-header">
          <h3 style="font-size:1rem">All Orders</h3>
          <button class="btn btn-secondary btn-sm" onclick="AdminApp.loadAllOrders()">🔄 Refresh</button>
        </div>
        <div class="filter-row">
          <select class="filter-select" id="filter-source" onchange="AdminApp.applyOrderFilters()">
            <option value="">All Sources</option>
            <option value="ONLINE">🌐 Online</option>
            <option value="COUNTER">🏪 Counter</option>
          </select>
          <select class="filter-select" id="filter-status" onchange="AdminApp.applyOrderFilters()">
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select class="filter-select" id="filter-payment" onchange="AdminApp.applyOrderFilters()">
            <option value="">All Payments</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
          <select class="filter-select" id="filter-method" onchange="AdminApp.applyOrderFilters()">
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
          </select>
          <input type="date" class="filter-select" id="filter-date" onchange="AdminApp.applyOrderFilters()"
                 style="padding:6px 10px;">
        </div>
        <div id="orders-table-body" style="overflow-x:auto">
          <div style="padding:24px;text-align:center"><span class="spinner"></span></div>
        </div>
      </div>
    `);

    const result = await API.getOrders({ limit: 100 });
    const wrap = document.getElementById('orders-table-body');
    if (wrap && result.success) wrap.innerHTML = this.renderOrdersTable(result.orders);
  },

  async applyOrderFilters() {
    const source  = document.getElementById('filter-source')?.value;
    const status  = document.getElementById('filter-status')?.value;
    const paymentStatus = document.getElementById('filter-payment')?.value;
    const paymentMethod = document.getElementById('filter-method')?.value;
    const date    = document.getElementById('filter-date')?.value;

    const params = {};
    if (source) params.source = source;
    if (status) params.status = status;
    if (paymentStatus) params.paymentStatus = paymentStatus;
    if (paymentMethod) params.paymentMethod = paymentMethod;
    if (date) params.date = date;

    const wrap = document.getElementById('orders-table-body');
    if (wrap) wrap.innerHTML = '<div style="padding:24px;text-align:center"><span class="spinner"></span></div>';

    const result = await API.getOrders(params);
    if (wrap && result.success) wrap.innerHTML = this.renderOrdersTable(result.orders);
  },

  renderOrdersTable(orders) {
    if (!orders || orders.length === 0) {
      return '<div style="padding:32px;text-align:center;color:var(--text-muted)">No orders found</div>';
    }

    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Order</th><th>Token</th><th>Source</th><th>Customer</th>
            <th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td><strong>${escHtml(o.order_number)}</strong></td>
              <td>${o.token_number ? `<strong style="color:var(--primary)">${o.token_number}</strong>` : '—'}</td>
              <td>${getSourceBadge(o.order_source)}</td>
              <td>
                <div style="font-size:0.82rem">${escHtml(o.customer_type)}</div>
                ${o.customer_name ? `<div style="font-size:0.78rem;color:var(--text-muted)">${escHtml(o.customer_name)}</div>` : ''}
              </td>
              <td style="max-width:200px;font-size:0.82rem;color:var(--text-muted)">${escHtml(o.items_summary || '')}</td>
              <td><strong>${formatCurrency(o.total)}</strong></td>
              <td>
                <div>${o.payment_method}</div>
                <div>${getPayBadge(o.payment_status)}</div>
              </td>
              <td>${getStatusBadge(o.status)}</td>
              <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap">${formatDate(o.created_at)}</td>
              <td>
                <div class="flex gap-1">
                  ${o.status === 'READY' ? `<button class="btn btn-success btn-sm" onclick="AdminApp.markCompleted(${o.id})">✓ Done</button>` : ''}
                  ${o.status === 'PREPARING' ? `<button class="btn btn-secondary btn-sm" onclick="AdminApp.markReady(${o.id})">Ready</button>` : ''}
                  ${['PENDING','PREPARING'].includes(o.status) ? `<button class="btn btn-danger btn-sm" onclick="AdminApp.cancelOrder(${o.id})">✕</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  async loadCounterOrders() {
    const result = await API.getCounterOrders();
    this.setContent(`
      <div class="orders-table-wrap">
        <div class="table-header">
          <h3 style="font-size:1rem">Today's Counter Orders</h3>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" onclick="AdminApp.loadCounterOrders()">🔄 Refresh</button>
            <button class="btn btn-primary btn-sm" onclick="POS.open()">+ New Counter Order</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          ${result.success ? this.renderOrdersTable(result.orders) : '<div style="padding:24px;color:var(--danger)">Failed to load orders</div>'}
        </div>
      </div>
    `);
  },

  // ---- Pickup Board ----
  async loadPickupBoard() {
    const result = await API.pickupBoard();
    const orders = result.success ? result.orders : [];

    this.setContent(`
      <div class="flex items-center justify-between mb-3">
        <h2 style="font-size:1.2rem">🔔 Pickup Board</h2>
        <button class="btn btn-secondary btn-sm" onclick="AdminApp.loadPickupBoard()">🔄 Refresh</button>
      </div>
      ${orders.length === 0 ? '<div style="text-align:center;color:var(--text-muted);padding:60px">No active orders right now</div>' : `
      <div class="pickup-board">
        ${orders.map(o => `
          <div class="pickup-card status-${o.status}">
            <div class="pickup-token">${o.token_number || o.order_number}</div>
            <div class="pickup-order">${o.order_number} · ${o.customer_type}</div>
            <div class="pickup-items" style="margin-bottom:10px">${o.status}</div>
            ${getStatusBadge(o.status)}
            <div class="flex gap-1 mt-2">
              ${o.status === 'PREPARING' ? `<button class="btn btn-secondary btn-sm btn-full" onclick="AdminApp.markReady(${o.id || ''})">Mark Ready</button>` : ''}
              ${o.status === 'READY' ? `<button class="btn btn-success btn-sm btn-full" onclick="AdminApp.markCompletedFromBoard('${o.order_number}')">✓ Hand Over</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      `}
    `);
  },

  async refreshPickupBadge() {
    const result = await API.pickupBoard();
    if (result.success) {
      const readyCount = result.orders.filter(o => o.status === 'READY').length;
      const badge = document.getElementById('pickup-badge');
      if (badge) {
        badge.textContent = readyCount;
        badge.style.display = readyCount > 0 ? 'flex' : 'none';
      }
    }
  },

  async markCompleted(orderId) {
    const result = await API.updateStatus(orderId, 'COMPLETED');
    if (result.success) { showToast('Order marked completed', 'success'); this.loadAllOrders(); }
    else showToast(result.message, 'error');
  },

  async markCompletedFromBoard(orderNumber) {
    const trackResult = await API.trackOrder(orderNumber);
    if (trackResult.success) await this.markCompleted(trackResult.order.id);
  },

  async markReady(orderId) {
    const result = await API.updateStatus(orderId, 'READY');
    if (result.success) { showToast('Order is ready for pickup', 'success'); this.navigate(this.currentSection); }
    else showToast(result.message, 'error');
  },

  async cancelOrder(orderId) {
    if (!confirm('Cancel this order and restore stock?')) return;
    const result = await API.cancelOrder(orderId);
    if (result.success) { showToast('Order cancelled, stock restored', 'success'); this.loadAllOrders(); }
    else showToast(result.message || 'Failed to cancel', 'error');
  },

  // ---- Menu Management ----
  async loadMenu() {
    const result = await API.getAdminMenu();
    const items = result.success ? result.items : [];

    this.setContent(`
      <div class="flex items-center justify-between mb-3">
        <h2 style="font-size:1.2rem">🍔 Menu Management</h2>
        <button class="btn btn-primary btn-sm" onclick="AdminApp.showAddItemModal()">+ Add Item</button>
      </div>
      <div class="stock-grid" id="menu-items-grid">
        ${items.map(item => `
          <div class="stock-item-card">
            <div class="stock-emoji">${item.image_emoji}</div>
            <div class="stock-name">${escHtml(item.name)}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px">${escHtml(item.category_name || 'Uncategorized')}</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--primary)">${formatCurrency(item.price)}</div>
            <div class="stock-level ${item.stock <= 5 ? 'stock-low' : item.stock <= 20 ? 'stock-medium' : 'stock-good'}">
              Stock: ${item.stock}
            </div>
            <div style="margin-top:8px">
              ${item.is_available ? '<span class="badge badge-success">Available</span>' : '<span class="badge badge-danger">Unavailable</span>'}
            </div>
            <div class="flex gap-1 mt-2">
              <button class="btn btn-ghost btn-sm" onclick="AdminApp.toggleAvailability(${item.id}, ${item.is_available})">
                ${item.is_available ? '🚫 Hide' : '✓ Show'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `);
  },

  async toggleAvailability(id, current) {
    const result = await API.updateMenuItem(id, { isAvailable: !current });
    if (result.success) { showToast('Updated', 'success'); this.loadMenu(); }
    else showToast(result.message, 'error');
  },

  showAddItemModal() {
    // Simple inline form for brevity
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Food Item</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="flex-col gap-2">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" id="new-item-name" class="form-control" placeholder="e.g. Samosa">
          </div>
          <div class="form-group">
            <label class="form-label">Price (₹)</label>
            <input type="number" id="new-item-price" class="form-control" placeholder="15">
          </div>
          <div class="form-group">
            <label class="form-label">Initial Stock</label>
            <input type="number" id="new-item-stock" class="form-control" placeholder="100">
          </div>
          <div class="form-group">
            <label class="form-label">Emoji</label>
            <input type="text" id="new-item-emoji" class="form-control" placeholder="🍽️" maxlength="4">
          </div>
          <button class="btn btn-primary btn-full mt-2" onclick="AdminApp.addItem(this)">Add Item</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async addItem(btn) {
    btn.disabled = true;
    const result = await API.addMenuItem({
      name:       document.getElementById('new-item-name').value,
      price:      parseFloat(document.getElementById('new-item-price').value),
      stock:      parseInt(document.getElementById('new-item-stock').value) || 0,
      imageEmoji: document.getElementById('new-item-emoji').value || '🍽️',
    });
    btn.disabled = false;

    if (result.success) {
      showToast('Item added!', 'success');
      document.querySelector('.modal-overlay')?.remove();
      this.loadMenu();
    } else {
      showToast(result.message || 'Failed', 'error');
    }
  },

  // ---- Stock Management ----
  async loadStock() {
    const result = await API.getStock();
    const items = result.success ? result.items : [];

    this.setContent(`
      <div class="flex items-center justify-between mb-3">
        <h2 style="font-size:1.2rem">📦 Stock Management</h2>
        <button class="btn btn-secondary btn-sm" onclick="AdminApp.loadStock()">🔄 Refresh</button>
      </div>
      <div class="stock-grid">
        ${items.map(item => {
          const pct = Math.min(100, (item.stock / 100) * 100);
          const colorClass = item.stock <= 5 ? 'stock-low' : item.stock <= 20 ? 'stock-medium' : 'stock-good';
          const barColor = item.stock <= 5 ? 'var(--danger)' : item.stock <= 20 ? 'var(--accent)' : 'var(--success)';
          return `
            <div class="stock-item-card">
              <div class="stock-emoji">${item.image_emoji}</div>
              <div class="stock-name">${escHtml(item.name)}</div>
              <div class="stock-level ${colorClass}">${item.stock}</div>
              <div class="stock-bar">
                <div class="stock-bar-fill" style="width:${pct}%;background:${barColor}"></div>
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px">${escHtml(item.category_name || '')}</div>
              <div class="flex gap-1">
                <button class="btn btn-secondary btn-sm" onclick="AdminApp.adjustStock(${item.id}, '${escHtml(item.name)}', ${item.stock})">
                  ± Adjust
                </button>
                <button class="btn btn-ghost btn-sm" onclick="AdminApp.viewStockHistory(${item.id}, '${escHtml(item.name)}')">
                  📜 History
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `);
  },

  adjustStock(itemId, itemName, currentStock) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Adjust Stock — ${escHtml(itemName)}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:16px">
          Current stock: <strong style="color:var(--text-primary)">${currentStock}</strong>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Adjustment (+/-)</label>
          <input type="number" id="adj-qty" class="form-control" placeholder="e.g. +50 or -5">
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Reason / Note</label>
          <input type="text" id="adj-note" class="form-control" placeholder="e.g. Restock delivery">
        </div>
        <button class="btn btn-primary btn-full" onclick="AdminApp.submitStockAdjust(${itemId}, this)">Apply Adjustment</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async submitStockAdjust(itemId, btn) {
    const qty  = parseInt(document.getElementById('adj-qty').value);
    const note = document.getElementById('adj-note').value;
    if (isNaN(qty) || qty === 0) { showToast('Enter a valid quantity', 'warning'); return; }

    btn.disabled = true;
    const result = await API.adjustStock(itemId, qty, note);
    btn.disabled = false;

    if (result.success) {
      showToast(`Stock updated → ${result.newStock}`, 'success');
      document.querySelector('.modal-overlay')?.remove();
      this.loadStock();
    } else {
      showToast(result.message || 'Failed', 'error');
    }
  },

  async viewStockHistory(itemId, itemName) {
    const result = await API.stockHistory(itemId);
    const history = result.success ? result.history : [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <div class="modal-title">📜 Stock History — ${escHtml(itemName)}</div>
          <button class="btn btn-ghost btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div style="overflow-y:auto;max-height:400px">
          ${history.length === 0 ? '<div style="text-align:center;color:var(--text-muted);padding:24px">No history</div>' : `
          <table class="data-table">
            <thead><tr><th>Date</th><th>Prev</th><th>Change</th><th>New</th><th>Reason</th><th>Order</th><th>By</th></tr></thead>
            <tbody>
              ${history.map(h => `
                <tr>
                  <td style="font-size:0.78rem;white-space:nowrap">${formatDate(h.created_at)}</td>
                  <td>${h.previous_stock}</td>
                  <td style="color:${h.change_amount < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700">${h.change_amount > 0 ? '+' : ''}${h.change_amount}</td>
                  <td><strong>${h.new_stock}</strong></td>
                  <td><span class="badge badge-neutral">${h.reason}</span></td>
                  <td style="font-size:0.78rem">${h.order_number || '—'}</td>
                  <td style="font-size:0.78rem">${h.admin_name || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          `}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // ---- Analytics ----
  async loadAnalytics() {
    const [summary, topItems, payments] = await Promise.all([
      API.analytics(),
      API.topItems(8, 7),
      API.payments(30),
    ]);

    const s = summary.success ? summary.summary : {};
    const online  = s.online  || { order_count: 0, revenue: 0 };
    const counter = s.counter || { order_count: 0, revenue: 0 };
    const total   = s.total   || { order_count: 0, revenue: 0 };

    const topItemsHtml = (topItems.items || []).map((item, i) => {
      const maxQty = topItems.items[0]?.total_qty || 1;
      const pct = (item.total_qty / maxQty * 100).toFixed(0);
      return `
        <div class="bar-row">
          <div class="bar-label" title="${escHtml(item.food_name)}">${escHtml(item.food_name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-value">${item.total_qty} sold</div>
        </div>
      `;
    }).join('');

    const payHtml = (payments.data || []).map(p => {
      const maxRev = payments.data[0]?.revenue || 1;
      const pct = (p.revenue / maxRev * 100).toFixed(0);
      return `
        <div class="bar-row">
          <div class="bar-label">${p.payment_method}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--primary))"></div></div>
          <div class="bar-value">${formatCurrency(p.revenue)}</div>
        </div>
      `;
    }).join('');

    this.setContent(`
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card" style="--stat-color:var(--success)">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Today Total</div>
          <div class="stat-value">${formatCurrency(total.revenue)}</div>
          <div class="stat-subvalue">${total.order_count} orders</div>
        </div>
        <div class="stat-card" style="--stat-color:var(--info)">
          <div class="stat-icon">🌐</div>
          <div class="stat-label">Online</div>
          <div class="stat-value">${formatCurrency(online.revenue)}</div>
          <div class="stat-subvalue">${online.order_count} orders</div>
        </div>
        <div class="stat-card" style="--stat-color:var(--accent)">
          <div class="stat-icon">🏪</div>
          <div class="stat-label">Counter</div>
          <div class="stat-value">${formatCurrency(counter.revenue)}</div>
          <div class="stat-subvalue">${counter.order_count} orders</div>
        </div>
      </div>

      <div class="analytics-grid">
        <div class="chart-card">
          <div class="chart-title">🏆 Top Selling Items</div>
          <div class="chart-subtitle">Last 7 days</div>
          <div class="bar-chart">${topItemsHtml || '<div style="color:var(--text-muted)">No data yet</div>'}</div>
        </div>
        <div class="chart-card">
          <div class="chart-title">💳 Payment Methods</div>
          <div class="chart-subtitle">Last 30 days</div>
          <div class="bar-chart">${payHtml || '<div style="color:var(--text-muted)">No data yet</div>'}</div>
        </div>
      </div>

      <div class="chart-card mt-3">
        <div class="chart-title">📊 Online vs Counter Revenue</div>
        <div class="chart-subtitle">Today</div>
        <div class="revenue-split">
          <div class="revenue-item">
            <div class="revenue-label">🌐 Online</div>
            <div class="revenue-value revenue-online">${formatCurrency(online.revenue)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${online.order_count} orders</div>
          </div>
          <div class="revenue-item">
            <div class="revenue-label">🏪 Counter</div>
            <div class="revenue-value revenue-counter">${formatCurrency(counter.revenue)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${counter.order_count} orders</div>
          </div>
          <div class="revenue-item">
            <div class="revenue-label">📊 Total</div>
            <div class="revenue-value revenue-total">${formatCurrency(total.revenue)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${total.order_count} orders</div>
          </div>
        </div>
      </div>
    `);
  },

  // ---- Payments Audit Section ----
  async loadPayments(filter = {}) {
    this.setContent(`
      <div class="flex items-center justify-center" style="height:300px">
        <span class="spinner" style="width:40px;height:40px"></span>
      </div>
    `);

    const result = await API.getPayments(filter);
    const payments = result.success ? result.payments : [];

    const totalCaptured = payments
      .filter(p => p.status === 'CAPTURED')
      .reduce((s, p) => s + (p.amount_paise ? p.amount_paise / 100 : p.amount_due), 0);
    const onlineCaptured = payments
      .filter(p => p.status === 'CAPTURED' && p.provider === 'RAZORPAY')
      .reduce((s, p) => s + (p.amount_paise ? p.amount_paise / 100 : p.amount_due), 0);
    const cashCaptured = payments
      .filter(p => p.status === 'CAPTURED' && p.provider === 'CASH')
      .reduce((s, p) => s + (p.amount_paise ? p.amount_paise / 100 : p.amount_due), 0);
    const refundedTotal = payments
      .filter(p => p.status === 'REFUNDED')
      .reduce((s, p) => s + (p.amount_paise ? p.amount_paise / 100 : p.amount_due), 0);

    const rows = payments.map(p => {
      const amt = p.amount_paise ? (p.amount_paise / 100).toFixed(2) : p.amount_due.toFixed(2);
      const statusColors = {
        CAPTURED: 'background:rgba(16,185,129,0.15);color:#10b981',
        REFUNDED: 'background:rgba(239,68,68,0.15);color:#ef4444',
        FAILED: 'background:rgba(239,68,68,0.15);color:#ef4444',
        CREATED: 'background:rgba(245,158,11,0.15);color:#f59e0b',
        PENDING: 'background:rgba(245,158,11,0.15);color:#f59e0b',
      };
      const badgeStyle = statusColors[p.status] || 'background:rgba(255,255,255,0.1);color:#fff';

      return `
        <tr>
          <td><strong style="font-family:monospace">#${p.id}</strong></td>
          <td><strong style="color:var(--primary)">${escHtml(p.order_number)}</strong></td>
          <td>${escHtml(p.customer_name || 'Walk-in')} <span class="badge" style="font-size:0.7rem">${p.customer_type || ''}</span></td>
          <td>
            <span class="badge">${p.provider}</span>
            <span style="font-size:0.75rem;color:var(--text-muted)">(${p.method})</span>
          </td>
          <td><strong style="font-size:0.95rem">₹${amt}</strong></td>
          <td>
            <span style="display:inline-block;padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;${badgeStyle}">
              ${p.status}
            </span>
          </td>
          <td style="font-size:0.8rem">
            ${p.signature_verified ? '<span title="Signature verified">🔒✓</span>' : '<span style="color:#888">—</span>'}
            ${p.webhook_verified ? '<span title="Webhook verified">⚡✓</span>' : ''}
          </td>
          <td style="font-size:0.8rem;color:var(--text-secondary)">${new Date(p.created_at).toLocaleString()}</td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" onclick="AdminApp.viewReceipt(${p.order_id})" title="View Digital Receipt">
                📄
              </button>
              ${p.status === 'CAPTURED' ? `
                <button class="btn btn-danger btn-sm" onclick="AdminApp.refundPayment(${p.order_id})" title="Refund Payment">
                  ↩️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.setContent(`
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card" style="--stat-color:var(--success)">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Verified Revenue</div>
          <div class="stat-value">₹${totalCaptured.toFixed(2)}</div>
          <div class="stat-subvalue">From captured payments</div>
        </div>
        <div class="stat-card" style="--stat-color:var(--info)">
          <div class="stat-icon">💳</div>
          <div class="stat-label">Razorpay / Online</div>
          <div class="stat-value">₹${onlineCaptured.toFixed(2)}</div>
          <div class="stat-subvalue">Gateway transactions</div>
        </div>
        <div class="stat-card" style="--stat-color:var(--accent)">
          <div class="stat-icon">💵</div>
          <div class="stat-label">Counter Cash</div>
          <div class="stat-value">₹${cashCaptured.toFixed(2)}</div>
          <div class="stat-subvalue">Physical register</div>
        </div>
        <div class="stat-card" style="--stat-color:var(--danger)">
          <div class="stat-icon">↩️</div>
          <div class="stat-label">Refunds</div>
          <div class="stat-value">₹${refundedTotal.toFixed(2)}</div>
          <div class="stat-subvalue">Reversed transactions</div>
        </div>
      </div>

      <div class="chart-card">
        <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:10px">
          <div>
            <div class="chart-title">💳 Payments & Settlement Ledger</div>
            <div class="chart-subtitle">Audit trail of all online and counter payments</div>
          </div>
          <div class="flex gap-2">
            <select class="form-control form-control-sm" id="pay-filter-provider" onchange="AdminApp.applyPaymentFilters()">
              <option value="">All Providers</option>
              <option value="RAZORPAY" ${filter.provider === 'RAZORPAY' ? 'selected' : ''}>Razorpay</option>
              <option value="CASH" ${filter.provider === 'CASH' ? 'selected' : ''}>Cash Register</option>
            </select>
            <select class="form-control form-control-sm" id="pay-filter-status" onchange="AdminApp.applyPaymentFilters()">
              <option value="">All Statuses</option>
              <option value="CAPTURED" ${filter.status === 'CAPTURED' ? 'selected' : ''}>Captured / Paid</option>
              <option value="CREATED" ${filter.status === 'CREATED' ? 'selected' : ''}>Created / Pending</option>
              <option value="REFUNDED" ${filter.status === 'REFUNDED' ? 'selected' : ''}>Refunded</option>
              <option value="FAILED" ${filter.status === 'FAILED' ? 'selected' : ''}>Failed</option>
            </select>
            <button class="btn btn-ghost btn-sm" onclick="AdminApp.loadPayments()">🔄 Refresh</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table" style="width:100%">
            <thead>
              <tr>
                <th>ID</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Provider (Method)</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Security</th>
                <th>Timestamp</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">No payment records found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `);
  },

  applyPaymentFilters() {
    const provider = document.getElementById('pay-filter-provider')?.value || '';
    const status = document.getElementById('pay-filter-status')?.value || '';
    this.loadPayments({ provider, status });
  },

  async viewReceipt(orderId) {
    const res = await API.getReceipt(orderId);
    if (!res.success || !res.receipt) {
      showToast('Receipt not found', 'error');
      return;
    }

    const r = res.receipt;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'admin-receipt-modal';
    modal.innerHTML = `
      <div class="modal modal-lg" style="max-width:440px;text-align:left">
        <div class="modal-header">
          <div class="modal-title">Receipt #${r.order_number}</div>
          <button class="btn btn-ghost btn-icon" onclick="document.getElementById('admin-receipt-modal').remove()">✕</button>
        </div>

        <div style="background:#fff;color:#111;padding:20px;border-radius:10px;font-family:monospace;margin:12px 0">
          <div style="text-align:center;border-bottom:2px dashed #ccc;padding-bottom:8px;margin-bottom:12px">
            <h3 style="margin:0">🍽️ SMART CANTEEN</h3>
            <div style="font-size:0.75rem;color:#666">${new Date(r.created_at).toLocaleString()}</div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem"><span>Order:</span><strong>${r.order_number}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem"><span>Payment:</span><strong>${r.payment_method} (${r.payment_status})</strong></div>
          <div style="border-top:1px dashed #ccc;border-bottom:1px dashed #ccc;padding:8px 0;margin:8px 0">
            ${r.items.map(it => `
              <div style="display:flex;justify-content:space-between;font-size:0.8rem">
                <span>${escHtml(it.food_name)} × ${it.quantity}</span>
                <span>₹${it.subtotal}</span>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:bold">
            <span>TOTAL:</span><span>₹${r.total}</span>
          </div>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-primary btn-full" onclick="window.print()">🖨️ Print</button>
          <button class="btn btn-ghost" onclick="document.getElementById('admin-receipt-modal').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async refundPayment(orderId) {
    const reason = prompt('Enter reason for refund:');
    if (reason === null) return;

    if (!confirm('Are you sure you want to process a full refund for this order? Inventory will be restored.')) {
      return;
    }

    const res = await API.refundOrderPayment(orderId, reason || 'Admin initiated refund');
    if (!res.success) {
      showToast(res.message || 'Refund failed', 'error');
      return;
    }

    showToast('Refund processed successfully! ✅', 'success');
    this.loadPayments();
  },

  // =============================================
  // QR SCANNER & PICKUP VERIFICATION
  // =============================================
  playScanBeep(success = true) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = success ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(success ? 880 : 320, ctx.currentTime);
      if (success) {
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      }
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch (e) {}
  },

  async loadScanQR() {
    this.setContent(`
      <div class="scanner-page-grid">
        <!-- Left: Live Scanner & Input -->
        <div class="scanner-box">
          <div class="scanner-box-header">
            <div class="scanner-box-title">
              <span>📷</span> Live Camera QR Scanner
            </div>
            <div class="flex gap-2">
              <button class="btn btn-outline btn-sm" onclick="AdminApp.toggleCameraFacing()" title="Switch camera" id="btn-camera-flip">
                🔄 Flip Cam
              </button>
              <button class="btn btn-secondary btn-sm" onclick="AdminApp.toggleCameraScanner()" id="btn-camera-toggle">
                ⏸️ Pause
              </button>
            </div>
          </div>

          <!-- Camera Viewport -->
          <div class="scanner-viewport-wrapper">
            <div id="qr-scanner-region"></div>
            <div class="scanner-reticle-overlay" id="scanner-reticle">
              <div class="scanner-reticle-corners"></div>
              <div class="scanner-laser-line"></div>
            </div>
          </div>

          <!-- Controls & Upload -->
          <div class="scanner-controls">
            <span class="text-small text-muted" id="scanner-status-text">Point camera at customer's order QR code</span>
            <label class="btn btn-ghost btn-sm" style="margin-left:auto;cursor:pointer">
              📁 Upload Image
              <input type="file" accept="image/*" style="display:none" onchange="AdminApp.handleImageUpload(event, 'qr-scanner-region')">
            </label>
          </div>

          <!-- Manual Order Number / Token Input -->
          <div class="scanner-manual-box">
            <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">
              ⌨️ Or Enter Order #, Token, or Code
            </div>
            <form onsubmit="AdminApp.handleManualScan(event)" style="display:flex;gap:8px">
              <input type="text" id="manual-qr-input" class="form-control"
                     placeholder="e.g. A-1 or ORD-20260920-xxxx" required style="font-family:monospace">
              <button type="submit" class="btn btn-primary" id="btn-manual-verify">
                Verify
              </button>
            </form>
          </div>
        </div>

        <!-- Right: Verification Result -->
        <div id="scan-result-container">
          ${this.renderScanIdleResult()}
        </div>
      </div>

      <!-- Recent Scans / Counter Pickups -->
      <div class="card mt-4" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-weight:700;font-size:1rem;display:flex;align-items:center;gap:8px">
            <span>⏱️</span> Recent Scans & Pickups (This Session)
          </div>
          <span class="text-small text-muted" id="recent-scans-count">${this.recentScans.length} scanned</span>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Token</th>
                <th>Order #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="recent-scans-tbody">
              ${this.renderRecentScansRows()}
            </tbody>
          </table>
        </div>
      </div>
    `);

    // Initialize camera
    setTimeout(() => {
      this.startCameraScanner('qr-scanner-region');
    }, 150);
  },

  renderScanIdleResult() {
    return `
      <div class="scanner-result-card" style="text-align:center;padding:48px 24px;border:2px dashed var(--border)">
        <div style="font-size:3.2rem;margin-bottom:12px;opacity:0.8">🎯</div>
        <div style="font-size:1.15rem;font-weight:700;margin-bottom:6px">Awaiting Customer QR</div>
        <div style="font-size:0.85rem;color:var(--text-muted);max-width:320px;margin:0 auto 18px">
          Align the customer's phone QR code within the camera frame, upload a QR screenshot, or enter the order number manually.
        </div>
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--bg-elevated);border-radius:var(--radius-full);font-size:0.8rem;color:var(--text-secondary)">
          <span class="pulse-indicator" style="width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block"></span>
          Ready to scan
        </div>
      </div>
    `;
  },

  async startCameraScanner(elementId) {
    if (!window.Html5Qrcode) {
      const statusEl = document.getElementById(elementId === 'modal-scanner-region' ? 'modal-scanner-status' : 'scanner-status-text');
      if (statusEl) statusEl.textContent = 'Scanner library loading...';
      return;
    }

    await this.stopCameraScanner();

    try {
      this.scannerInstance = new Html5Qrcode(elementId);
      this.scannerActive = true;
      const config = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0,
      };

      await this.scannerInstance.start(
        { facingMode: this.scannerFacingMode },
        config,
        (decodedText) => {
          this.onQRCodeScanned(decodedText, elementId);
        },
        () => {}
      );

      const statusEl = document.getElementById(elementId === 'modal-scanner-region' ? 'modal-scanner-status' : 'scanner-status-text');
      if (statusEl) statusEl.textContent = '🟢 Camera active — Ready to scan';
      const toggleBtn = document.getElementById('btn-camera-toggle');
      if (toggleBtn) toggleBtn.innerHTML = '⏸️ Pause';
    } catch (err) {
      this.scannerActive = false;
      const statusEl = document.getElementById(elementId === 'modal-scanner-region' ? 'modal-scanner-status' : 'scanner-status-text');
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--text-muted)">Camera unavailable or blocked. Enter order number or upload QR image.</span>';
      }
      const toggleBtn = document.getElementById('btn-camera-toggle');
      if (toggleBtn) toggleBtn.innerHTML = '▶️ Start Cam';
    }
  },

  async stopCameraScanner() {
    if (this.scannerInstance) {
      try {
        if (this.scannerInstance.isScanning) {
          await this.scannerInstance.stop();
        }
        await this.scannerInstance.clear();
      } catch (e) {}
      this.scannerInstance = null;
    }
    this.scannerActive = false;
  },

  async toggleCameraScanner(elementId = 'qr-scanner-region') {
    if (this.scannerActive) {
      await this.stopCameraScanner();
      const statusEl = document.getElementById('scanner-status-text');
      if (statusEl) statusEl.textContent = '⏸️ Camera paused';
      const toggleBtn = document.getElementById('btn-camera-toggle');
      if (toggleBtn) toggleBtn.innerHTML = '▶️ Resume';
    } else {
      await this.startCameraScanner(elementId);
    }
  },

  async toggleCameraFacing(elementId = 'qr-scanner-region') {
    this.scannerFacingMode = this.scannerFacingMode === 'environment' ? 'user' : 'environment';
    await this.startCameraScanner(elementId);
  },

  async handleImageUpload(e, elementId = 'qr-scanner-region') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      showToast('Processing QR image...', 'info');
      await this.stopCameraScanner();
      const tempScanner = new Html5Qrcode(elementId);
      const decodedText = await tempScanner.scanFile(file, true);
      await tempScanner.clear();
      this.onQRCodeScanned(decodedText, elementId);
    } catch (err) {
      showToast('No QR code found in uploaded image', 'error');
      this.startCameraScanner(elementId);
    }
    e.target.value = '';
  },

  async onQRCodeScanned(rawText, sourceRegion) {
    if (!rawText) return;

    const resultContainer = document.getElementById('scan-result-container');
    const modalResult = document.getElementById('modal-scan-result');

    const loadingHtml = `
      <div class="scanner-result-card" style="text-align:center;padding:40px 20px">
        <span class="spinner" style="width:36px;height:36px;margin-bottom:12px"></span>
        <div style="font-weight:600">Verifying Pickup QR with Server...</div>
      </div>
    `;

    if (resultContainer) resultContainer.innerHTML = loadingHtml;
    if (modalResult) modalResult.innerHTML = loadingHtml;

    // Call backend API verify and redeem
    const res = await API.verifyQR(rawText);

    if (res.success) {
      this.playScanBeep(true);
      showToast('Order verified & completed! Food handed over. ✅', 'success');

      const order = res.order;
      this.recentScans.unshift({
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        tokenNumber: order.token_number || `#${order.id}`,
        orderNumber: order.order_number,
        customerType: order.customer_type || 'ONLINE',
        total: order.total,
        status: 'COMPLETED',
      });

      const successHtml = this.renderScanSuccessResult(order, res.message);
      if (resultContainer) resultContainer.innerHTML = successHtml;
      if (modalResult) modalResult.innerHTML = successHtml;

      this.updateRecentScansTable();
      this.refreshPickupBadge();
    } else if (res.code === 'ORDER_ALREADY_COLLECTED') {
      this.playScanBeep(false);
      showToast('⚠️ WARNING: Order already collected!', 'error');

      const order = res.order || {};
      this.recentScans.unshift({
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        tokenNumber: order.token_number || '—',
        orderNumber: order.order_number || '—',
        customerType: order.customer_type || '—',
        total: order.total || 0,
        status: 'DUPLICATE_SCAN',
      });

      const collectedHtml = this.renderScanAlreadyCollectedResult(order, res.message);
      if (resultContainer) resultContainer.innerHTML = collectedHtml;
      if (modalResult) modalResult.innerHTML = collectedHtml;

      this.updateRecentScansTable();
    } else {
      this.playScanBeep(false);
      showToast(res.message || 'Invalid or expired QR code', 'error');

      const failedHtml = this.renderScanFailedResult(res.message, res.order);
      if (resultContainer) resultContainer.innerHTML = failedHtml;
      if (modalResult) modalResult.innerHTML = failedHtml;
    }
  },

  renderScanSuccessResult(order, message) {
    const itemsHtml = (order.items || []).map(item => `
      <div class="scan-item-row">
        <span><strong>${item.quantity}x</strong> ${escHtml(item.food_name)}</span>
        <span>${formatCurrency(item.subtotal)}</span>
      </div>
    `).join('') || '<div class="text-muted text-small">Items retrieved</div>';

    return `
      <div class="scanner-result-card status-verified">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:1.8rem">✅</span>
          <div>
            <div style="font-weight:800;font-size:1.1rem;color:var(--success)">ORDER VERIFIED & COMPLETED</div>
            <div style="font-size:0.8rem;color:var(--text-muted)">${escHtml(message || 'Food handed over to customer')}</div>
          </div>
        </div>

        <div class="scan-token-hero">
          <div>
            <div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700">Pickup Token</div>
            <div class="scan-token-num">${escHtml(order.token_number || '#' + order.id)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700">Order Number</div>
            <div style="font-size:0.95rem;font-weight:700;font-family:monospace">${escHtml(order.order_number)}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;font-size:0.85rem">
          <div>
            <span class="text-muted">Customer:</span>
            <strong>${escHtml(order.customer_name || order.customer_type || 'Customer')}</strong>
          </div>
          <div>
            <span class="text-muted">Source:</span>
            ${getSourceBadge(order.order_source)}
          </div>
          <div>
            <span class="text-muted">Payment:</span>
            <span class="badge" style="background:rgba(34,197,94,0.15);color:var(--success);font-weight:700">PAID (${formatCurrency(order.total)})</span>
          </div>
          <div>
            <span class="text-muted">Method:</span>
            <strong>${escHtml(order.payment_method || 'ONLINE')}</strong>
          </div>
        </div>

        <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px">
          📦 Items to Hand Over:
        </div>
        <div class="scan-items-list">
          ${itemsHtml}
        </div>

        <div style="display:flex;gap:10px;margin-top:18px">
          <button class="btn btn-outline btn-full" onclick="AdminApp.viewPaymentReceipt(${order.id})">
            📄 Print Receipt
          </button>
          <button class="btn btn-primary btn-full" onclick="AdminApp.resetScanView()">
            📷 Scan Next Customer
          </button>
        </div>
      </div>
    `;
  },

  renderScanAlreadyCollectedResult(order, message) {
    return `
      <div class="scanner-result-card status-already-collected">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:2rem">⚠️</span>
          <div>
            <div style="font-weight:800;font-size:1.15rem;color:#f59e0b">ORDER ALREADY COLLECTED</div>
            <div style="font-size:0.85rem;color:var(--text-secondary)">Do NOT dispense food again.</div>
          </div>
        </div>

        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;font-size:0.88rem">
          <strong>Notice:</strong> ${escHtml(message || 'This QR token has already been scanned and redeemed.')}
        </div>

        <div class="scan-token-hero">
          <div>
            <div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700">Token</div>
            <div class="scan-token-num" style="color:#f59e0b">${escHtml(order.token_number || '#' + (order.id || ''))}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary);font-weight:700">Order Number</div>
            <div style="font-size:0.95rem;font-weight:700;font-family:monospace">${escHtml(order.order_number || '—')}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:18px">
          ${order.id ? `<button class="btn btn-outline btn-full" onclick="AdminApp.viewPaymentReceipt(${order.id})">📄 View Receipt</button>` : ''}
          <button class="btn btn-primary btn-full" onclick="AdminApp.resetScanView()">
            📷 Scan Next Customer
          </button>
        </div>
      </div>
    `;
  },

  renderScanFailedResult(message, order) {
    return `
      <div class="scanner-result-card status-invalid">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:2rem">❌</span>
          <div>
            <div style="font-weight:800;font-size:1.15rem;color:var(--danger)">VERIFICATION REJECTED</div>
            <div style="font-size:0.85rem;color:var(--text-secondary)">Food cannot be handed over.</div>
          </div>
        </div>

        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;font-size:0.88rem;color:var(--danger)">
          <strong>Error:</strong> ${escHtml(message || 'Invalid or unknown token.')}
        </div>

        ${order ? `
          <div style="font-size:0.85rem;margin-bottom:14px">
            <div>Order: <strong>${escHtml(order.order_number || '')}</strong></div>
            <div>Payment Status: <strong>${escHtml(order.payment_status || 'PENDING')}</strong></div>
          </div>
        ` : ''}

        <button class="btn btn-secondary btn-full" onclick="AdminApp.resetScanView()">
          🔄 Try Again
        </button>
      </div>
    `;
  },

  resetScanView() {
    const container = document.getElementById('scan-result-container');
    if (container) container.innerHTML = this.renderScanIdleResult();
    const manualInput = document.getElementById('manual-qr-input');
    if (manualInput) {
      manualInput.value = '';
      manualInput.focus();
    }
  },

  handleManualScan(e) {
    e.preventDefault();
    const input = document.getElementById('manual-qr-input');
    if (!input || !input.value.trim()) return;
    this.onQRCodeScanned(input.value.trim(), 'qr-scanner-region');
  },

  renderRecentScansRows() {
    if (!this.recentScans || this.recentScans.length === 0) {
      return `<tr><td colspan="7" class="text-center text-muted py-3">No QR pickups scanned in this session yet.</td></tr>`;
    }
    return this.recentScans.map(s => `
      <tr>
        <td style="font-size:0.8rem;color:var(--text-muted)">${s.time}</td>
        <td><strong style="color:var(--primary)">${escHtml(s.tokenNumber)}</strong></td>
        <td style="font-family:monospace;font-size:0.85rem">${escHtml(s.orderNumber)}</td>
        <td>${escHtml(s.customerType)}</td>
        <td>${formatCurrency(s.total)}</td>
        <td>
          <span class="scan-history-badge" style="${s.status === 'COMPLETED' ? 'background:rgba(34,197,94,0.15);color:var(--success)' : 'background:rgba(245,158,11,0.15);color:#f59e0b'}">
            ${s.status === 'COMPLETED' ? '✓ Handed Over' : '⚠️ Duplicate'}
          </span>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="AdminApp.onQRCodeScanned('${escHtml(s.orderNumber)}')">Re-check</button>
        </td>
      </tr>
    `).join('');
  },

  updateRecentScansTable() {
    const tbody = document.getElementById('recent-scans-tbody');
    if (tbody) tbody.innerHTML = this.renderRecentScansRows();
    const countEl = document.getElementById('recent-scans-count');
    if (countEl) countEl.textContent = `${this.recentScans.length} scanned`;
  },

  // ---- Modal Quick Scanner ----
  openQRScannerModal() {
    const existing = document.getElementById('scanner-quick-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'scanner-quick-modal';
    modal.className = 'scanner-modal-backdrop';
    modal.innerHTML = `
      <div class="scanner-modal-container">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--border)">
          <div style="font-weight:800;font-size:1.15rem;display:flex;align-items:center;gap:8px">
            <span>📷</span> Scan Customer QR Code
          </div>
          <button class="btn btn-ghost btn-sm" onclick="AdminApp.closeQRScannerModal()" style="font-size:1.2rem;line-height:1">✕</button>
        </div>

        <div style="padding:24px">
          <!-- Viewport -->
          <div class="scanner-viewport-wrapper" style="min-height:280px">
            <div id="modal-scanner-region"></div>
            <div class="scanner-reticle-overlay">
              <div class="scanner-reticle-corners"></div>
              <div class="scanner-laser-line"></div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
            <span class="text-small text-muted" id="modal-scanner-status">Align customer QR code in the frame</span>
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">
              📁 Upload Image
              <input type="file" accept="image/*" style="display:none" onchange="AdminApp.handleImageUpload(event, 'modal-scanner-region')">
            </label>
          </div>

          <!-- Manual Code Form -->
          <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
            <form onsubmit="AdminApp.handleModalManualScan(event)" style="display:flex;gap:8px">
              <input type="text" id="modal-manual-qr-input" class="form-control"
                     placeholder="Or enter Order #, Token (e.g. A-1), or code" style="font-family:monospace" required>
              <button type="submit" class="btn btn-primary">Verify</button>
            </form>
          </div>

          <!-- Dynamic Result Box inside Modal -->
          <div id="modal-scan-result" style="margin-top:16px"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
      this.startCameraScanner('modal-scanner-region');
    }, 150);
  },

  async closeQRScannerModal() {
    await this.stopCameraScanner();
    const modal = document.getElementById('scanner-quick-modal');
    if (modal) modal.remove();
  },

  handleModalManualScan(e) {
    e.preventDefault();
    const input = document.getElementById('modal-manual-qr-input');
    if (!input || !input.value.trim()) return;
    this.onQRCodeScanned(input.value.trim(), 'modal-scanner-region');
  },

  // ---- POS Overlay HTML ----
  renderPOSOverlay() {
    return `
      <div id="pos-overlay" class="hidden">
        <!-- POS Top Bar -->
        <div class="pos-topbar">
          <div class="pos-title">
            🏪 Counter Order
            <span class="pos-title-badge">POS</span>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" onclick="POS.clearCart()">🗑️ Clear Cart</button>
            <button class="btn btn-secondary btn-sm" onclick="POS.close()">✕ Close</button>
          </div>
        </div>

        <!-- POS Body -->
        <div class="pos-body">
          <!-- Left: Menu Panel -->
          <div class="pos-menu-panel">
            <div class="pos-category-tabs" id="pos-cat-tabs">
              <button class="cat-tab active" data-cat="all">All</button>
            </div>
            <div class="pos-search-bar">
              <input type="text" class="pos-search-input" placeholder="Search food items..."
                     oninput="POS.searchItems(this.value)" id="pos-search">
            </div>
            <div class="pos-items-grid" id="pos-items-grid">
              <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
                <span class="spinner" style="width:30px;height:30px"></span>
              </div>
            </div>
          </div>

          <!-- Right: Cart Panel -->
          <div class="pos-cart-panel">
            <!-- Customer Type -->
            <div class="customer-type-selector">
              <div class="ct-label">Customer Type *</div>
              <div class="ct-buttons">
                <button class="ct-btn" onclick="POS.selectCustomerType('STUDENT', this)">🎓 Student</button>
                <button class="ct-btn" onclick="POS.selectCustomerType('STAFF', this)">👔 Staff</button>
                <button class="ct-btn" onclick="POS.selectCustomerType('PARENT', this)">👨‍👩‍👧 Parent</button>
                <button class="ct-btn" onclick="POS.selectCustomerType('VISITOR', this)">🙋 Visitor</button>
              </div>
            </div>

            <!-- Optional Customer Info -->
            <div class="customer-info-section">
              <div class="customer-info-toggle" id="customer-info-toggle" onclick="POS.toggleCustomerInfo()">
                ▶ Add customer details (optional)
              </div>
              <div class="customer-info-fields hidden" id="customer-info-fields">
                <input type="text" class="ci-input" id="customer-name-input" placeholder="Customer name">
                <input type="tel" class="ci-input" id="customer-mobile-input" placeholder="Mobile number">
              </div>
            </div>

            <!-- Cart Items -->
            <div class="pos-cart-items" id="pos-cart-items">
              <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <div>Add items from the menu</div>
              </div>
            </div>

            <!-- Cart Summary + Payment -->
            <div class="pos-cart-summary">
              <div class="cart-totals">
                <div class="total-row grand-total">
                  <span>TOTAL</span>
                  <span class="total-amount" id="pos-grand-total">₹0.00</span>
                </div>
              </div>

              <!-- Payment Methods -->
              <div class="payment-section">
                <div class="ct-label" style="margin-bottom:8px">Payment Method *</div>
                <div class="payment-methods">
                  <button class="pay-method-btn" data-method="CASH" onclick="POS.selectPayment('CASH')">
                    <span class="pay-icon">💵</span> CASH
                  </button>
                  <button class="pay-method-btn" data-method="UPI" onclick="POS.selectPayment('UPI')">
                    <span class="pay-icon">📱</span> UPI
                  </button>
                  <button class="pay-method-btn" data-method="CARD" onclick="POS.selectPayment('CARD')">
                    <span class="pay-icon">💳</span> CARD
                  </button>
                </div>

                <!-- Cash UI -->
                <div id="cash-payment-ui" class="cash-payment-ui hidden">
                  <div class="cash-row">
                    <span class="cash-label">Amount Due</span>
                    <span id="pos-grand-total-2" style="font-weight:700;font-size:1rem">₹0.00</span>
                  </div>
                  <div class="cash-row" style="margin-top:8px">
                    <span class="cash-label">Cash Received</span>
                    <input type="number" class="cash-input" id="cash-received-input"
                           min="0" step="0.01" placeholder="0.00"
                           oninput="POS.updateCashChange()">
                  </div>
                  <div class="cash-row" style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
                    <span class="cash-label">Change</span>
                    <span class="change-display" id="cash-change-display">₹0.00</span>
                  </div>
                  <div id="cash-error" class="change-error"></div>
                </div>

                <!-- UPI UI -->
                <div id="upi-payment-ui" class="upi-payment-ui hidden">
                  <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px">
                    Generate QR for customer to scan
                  </div>
                  <img id="upi-qr-img" class="upi-qr-img hidden" src="" alt="UPI QR">
                  <div id="upi-amount" style="font-weight:700;font-size:1.1rem;color:var(--primary)"></div>
                  <div class="upi-verify-row">
                    <input type="text" class="form-control" id="upi-ref-input" placeholder="Transaction ref (optional)">
                    <button class="btn btn-success btn-sm" onclick="POS.verifyUPIPayment()">Verify</button>
                  </div>
                </div>

                <button class="btn-place-order" id="btn-place-order" onclick="POS.placeOrder()">
                  ✓ Confirm Order
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },
};

// Init on page load
document.addEventListener('DOMContentLoaded', () => AdminApp.init());
