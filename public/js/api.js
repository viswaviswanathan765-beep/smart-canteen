/* =============================================
   SMART CANTEEN — Shared API Client (api.js)
   ============================================= */

const API = {
  baseUrl: '',

  async _request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(this.baseUrl + path, opts);
    const data = await res.json().catch(() => ({ success: false, message: 'Invalid response' }));

    if (!res.ok && !data.message) {
      data.message = `HTTP ${res.status}`;
    }

    return { ok: res.ok, status: res.status, ...data };
  },

  get:    (path)        => API._request('GET',    path),
  post:   (path, body)  => API._request('POST',   path, body),
  put:    (path, body)  => API._request('PUT',    path, body),
  delete: (path)        => API._request('DELETE', path),

  // Auth
  login:  (email, password) => API.post('/api/auth/login', { email, password }),
  logout: ()                => API.post('/api/auth/logout'),
  me:     ()                => API.get('/api/auth/me'),

  // Menu
  getMenu:       ()         => API.get('/api/menu'),
  getAdminMenu:  ()         => API.get('/api/menu/admin'),
  stockCheck:    (items)    => API.post('/api/menu/stock-check', { items }),
  addMenuItem:   (data)     => API.post('/api/menu', data),
  updateMenuItem:(id, data) => API.put(`/api/menu/${id}`, data),
  deleteMenuItem:(id)       => API.delete(`/api/menu/${id}`),

  // Online Orders
  createOrder:   (data)     => API.post('/api/orders', data),
  trackOrder:    (num)      => API.get(`/api/orders/track/${num}`),
  getOrder:      (id)       => API.get(`/api/orders/${id}`),
  getOrders:     (params)   => API.get('/api/orders?' + new URLSearchParams(params)),
  updateStatus:  (id, s)    => API.put(`/api/orders/${id}/status`, { status: s }),
  cancelOrder:   (id)       => API.post(`/api/orders/${id}/cancel`),
  generateUPI:   (id)       => API.post(`/api/orders/${id}/pay/upi`),
  verifyUPI:     (id, ref)  => API.post(`/api/orders/${id}/pay/upi/verify`, { transactionRef: ref }),
  confirmUPI:    (id, ref)  => API.post(`/api/orders/${id}/pay/upi/confirm`, { transactionRef: ref }),
  pickupBoard:   ()         => API.get('/api/orders/pickup/board'),

  // Payments & Gateway
  createPaymentOrder: (data)           => API.post('/api/payments/create-order', data),
  verifyPayment:      (data)           => API.post('/api/payments/verify', data),
  getPayments:        (params = {})    => API.get('/api/payments?' + new URLSearchParams(params)),
  getPaymentById:     (id)             => API.get(`/api/payments/${id}`),
  refundOrderPayment: (orderId, reason)=> API.post(`/api/payments/${orderId}/refund`, { reason }),
  getReceipt:         (orderId)        => API.get(`/api/payments/receipt/${orderId}`),
  lookupQR:           (token)          => API.post('/api/payments/qr/lookup', { token }),
  verifyQR:           (token)          => API.post('/api/payments/qr/verify', { token }),

  // Counter Orders
  counterStockCheck: (items)       => API.post('/api/counter/stock-check', { items }),
  createCounterOrder:(data)        => API.post('/api/counter/orders', data),
  payCash:           (id, amount)  => API.post(`/api/counter/orders/${id}/pay/cash`, { amountReceived: amount }),
  generateCounterUPI:(id)          => API.post(`/api/counter/orders/${id}/pay/upi/generate`),
  verifyCounterUPI:  (id, ref)     => API.post(`/api/counter/orders/${id}/pay/upi/verify`, { transactionRef: ref }),
  getCounterOrders:  ()            => API.get('/api/counter/orders'),
  updateCounterStatus:(id, s)      => API.put(`/api/counter/orders/${id}/status`, { status: s }),

  // Stock
  getStock:      ()               => API.get('/api/stock'),
  adjustStock:   (id, qty, note)  => API.put(`/api/stock/${id}`, { quantity: qty, note }),
  stockHistory:  (id)             => API.get(`/api/stock/${id}/history`),
  allStockHistory:()              => API.get('/api/stock/history/all'),

  // Analytics
  analytics:     (date)     => API.get('/api/analytics/summary' + (date ? `?date=${date}` : '')),
  revenue:       (s, e)     => API.get(`/api/analytics/revenue?start=${s}&end=${e}`),
  topItems:      (l, d)     => API.get(`/api/analytics/top-items?limit=${l||10}&days=${d||7}`),
  payments:      (d)        => API.get(`/api/analytics/payments?days=${d||30}`),
};

// ---- Toast System ----
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3200);
}

// ---- Utility functions ----
function formatCurrency(amount) {
  return '₹' + parseFloat(amount || 0).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getStatusBadge(status) {
  return `<span class="status-badge status-${status}">${status}</span>`;
}

function getPayBadge(status) {
  return `<span class="status-badge pay-${status}">${status}</span>`;
}

function getSourceBadge(source) {
  return `<span class="source-badge-${source}">${source === 'COUNTER' ? '🏪 Counter' : '🌐 Online'}</span>`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
