/* =============================================
   SMART CANTEEN — Admin Dashboard (admin.js)
   ============================================= */

const AdminApp = {
  user: null,
  currentSection: 'dashboard',

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

          <nav class="sidebar-nav">
            <div class="nav-section-label">Overview</div>
            <div class="nav-item active" id="nav-dashboard" onclick="AdminApp.navigate('dashboard')">
              <span class="nav-icon">📊</span> Dashboard
            </div>

            <div class="nav-section-label">Orders</div>
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

            <div class="nav-section-label">Reports</div>
            <div class="nav-item" id="nav-analytics" onclick="AdminApp.navigate('analytics')">
              <span class="nav-icon">💰</span> Analytics
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
    this.currentSection = section;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById(`nav-${section}`);
    if (navEl) navEl.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      'all-orders': 'All Orders',
      'counter-orders': 'Counter Orders',
      pickup: 'Pickup Board',
      menu: 'Manage Menu',
      stock: 'Stock Management',
      analytics: 'Analytics',
    };
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = titles[section] || section;

    const sections = {
      dashboard:       () => this.loadDashboard(),
      'all-orders':    () => this.loadAllOrders(),
      'counter-orders':() => this.loadCounterOrders(),
      pickup:          () => this.loadPickupBoard(),
      menu:            () => this.loadMenu(),
      stock:           () => this.loadStock(),
      analytics:       () => this.loadAnalytics(),
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
