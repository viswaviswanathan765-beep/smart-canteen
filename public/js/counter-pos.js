/* =============================================
   SMART CANTEEN — Counter POS Module (counter-pos.js)
   Handles the full POS ordering interface for admin/staff.
   ============================================= */

const POS = {
  isOpen: false,
  allItems: [],
  categories: [],
  cart: [],          // [{foodItemId, name, price, quantity, emoji}]
  customerType: null,
  customerName: '',
  customerMobile: '',
  selectedPayment: null,
  cashReceived: 0,
  upiQrData: null,
  currentOrderId: null,
  showCustomerInfo: false,

  // ---- Open / Close ----
  open() {
    this.reset();
    const overlay = document.getElementById('pos-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      this.isOpen = true;
      this.loadMenu();
    }
  },

  close() {
    const overlay = document.getElementById('pos-overlay');
    if (overlay) overlay.classList.add('hidden');
    this.isOpen = false;
  },

  reset() {
    this.cart = [];
    this.customerType = null;
    this.customerName = '';
    this.customerMobile = '';
    this.selectedPayment = null;
    this.cashReceived = 0;
    this.upiQrData = null;
    this.currentOrderId = null;
    this.showCustomerInfo = false;
  },

  // ---- Load menu ----
  async loadMenu() {
    const result = await API.getMenu();
    if (!result.success) { showToast('Failed to load menu', 'error'); return; }

    this.allItems = result.items;
    this.categories = result.categories;

    this.renderCategoryTabs();
    this.renderItems(this.allItems);
  },

  // ---- Category tabs ----
  renderCategoryTabs() {
    const container = document.getElementById('pos-cat-tabs');
    if (!container) return;

    const allTab = `<button class="cat-tab active" data-cat="all" onclick="POS.filterByCategory('all', this)">All</button>`;
    const catTabs = this.categories.map(c =>
      `<button class="cat-tab" data-cat="${c.name}" onclick="POS.filterByCategory('${c.name}', this)">${c.name}</button>`
    ).join('');

    container.innerHTML = allTab + catTabs;
  },

  filterByCategory(cat, btn) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    const filtered = cat === 'all' ? this.allItems : this.allItems.filter(i => i.category_name === cat);
    this.renderItems(filtered);
  },

  // ---- Search ----
  searchItems(query) {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? this.allItems.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
      : this.allItems;

    // Reset active category
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    const allTab = document.querySelector('.cat-tab[data-cat="all"]');
    if (allTab) allTab.classList.add('active');

    this.renderItems(filtered);
  },

  // ---- Food items grid ----
  renderItems(items) {
    const grid = document.getElementById('pos-items-grid');
    if (!grid) return;

    if (items.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No items found</div>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      const cartItem = this.cart.find(c => c.foodItemId === item.id);
      const inCart = cartItem ? `<span class="food-cart-qty">${cartItem.quantity}</span>` : '';
      const stockClass = item.stock <= 5 ? 'food-stock-low' : item.stock <= 20 ? 'food-stock-med' : '';
      const outOfStock = item.stock <= 0 ? 'out-of-stock' : '';

      return `
        <div class="food-card ${inCart ? 'in-cart' : ''} ${outOfStock}"
             onclick="POS.addToCart(${item.id})"
             id="food-card-${item.id}">
          ${inCart}
          <div class="food-emoji">${item.image_emoji}</div>
          <div class="food-card-name">${escHtml(item.name)}</div>
          <div class="food-card-price">${formatCurrency(item.price)}</div>
          <div class="food-card-stock ${stockClass}">
            ${item.stock <= 0 ? '❌ Out of stock' : `Stock: ${item.stock}`}
          </div>
          <div class="add-indicator">+</div>
        </div>
      `;
    }).join('');
  },

  // ---- Cart operations ----
  addToCart(foodItemId) {
    const food = this.allItems.find(i => i.id === foodItemId);
    if (!food || food.stock <= 0) return;

    const existing = this.cart.find(c => c.foodItemId === foodItemId);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty >= food.stock) {
      showToast(`Only ${food.stock} "${food.name}" available`, 'warning');
      return;
    }

    if (existing) {
      existing.quantity++;
    } else {
      this.cart.push({
        foodItemId: food.id,
        name: food.name,
        price: food.price,
        quantity: 1,
        emoji: food.image_emoji,
      });
    }

    this.renderCart();
    this.updateFoodCard(foodItemId);
  },

  changeQty(foodItemId, delta) {
    const idx = this.cart.findIndex(c => c.foodItemId === foodItemId);
    if (idx === -1) return;

    const food = this.allItems.find(i => i.id === foodItemId);
    this.cart[idx].quantity += delta;

    if (this.cart[idx].quantity <= 0) {
      this.cart.splice(idx, 1);
    } else if (food && this.cart[idx].quantity > food.stock) {
      this.cart[idx].quantity = food.stock;
      showToast(`Max available: ${food.stock}`, 'warning');
    }

    this.renderCart();
    this.updateFoodCard(foodItemId);
  },

  removeFromCart(foodItemId) {
    this.cart = this.cart.filter(c => c.foodItemId !== foodItemId);
    this.renderCart();
    this.updateFoodCard(foodItemId);
  },

  clearCart() {
    const ids = this.cart.map(c => c.foodItemId);
    this.cart = [];
    this.renderCart();
    ids.forEach(id => this.updateFoodCard(id));
  },

  updateFoodCard(foodItemId) {
    const card = document.getElementById(`food-card-${foodItemId}`);
    if (!card) return;

    const cartItem = this.cart.find(c => c.foodItemId === foodItemId);
    const existing = card.querySelector('.food-cart-qty');
    if (existing) existing.remove();

    if (cartItem) {
      card.classList.add('in-cart');
      const badge = document.createElement('span');
      badge.className = 'food-cart-qty';
      badge.textContent = cartItem.quantity;
      card.appendChild(badge);
    } else {
      card.classList.remove('in-cart');
    }
  },

  // ---- Cart render ----
  renderCart() {
    const container = document.getElementById('pos-cart-items');
    if (!container) return;

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">🛒</div>
          <div>Add items from the menu</div>
        </div>`;
      this.updateTotals();
      return;
    }

    container.innerHTML = this.cart.map(item => `
      <div class="cart-item">
        <div>
          <div class="cart-item-name">${item.emoji} ${escHtml(item.name)}</div>
          <div class="cart-item-price">${formatCurrency(item.price)} each</div>
        </div>
        <div class="cart-qty-controls">
          <button class="qty-btn minus" onclick="POS.changeQty(${item.foodItemId}, -1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn plus" onclick="POS.changeQty(${item.foodItemId}, 1)">+</button>
        </div>
        <div class="cart-item-total">${formatCurrency(item.price * item.quantity)}</div>
        <button class="cart-remove" onclick="POS.removeFromCart(${item.foodItemId})" title="Remove">✕</button>
      </div>
    `).join('');

    this.updateTotals();
  },

  getTotal() {
    return this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  updateTotals() {
    const total = this.getTotal();
    const el = document.getElementById('pos-grand-total');
    if (el) el.textContent = formatCurrency(total);

    // Update cash change
    this.updateCashChange();
  },

  // ---- Customer type ----
  selectCustomerType(type, btn) {
    this.customerType = type;
    document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  },

  toggleCustomerInfo() {
    this.showCustomerInfo = !this.showCustomerInfo;
    const fields = document.getElementById('customer-info-fields');
    const toggle = document.getElementById('customer-info-toggle');
    if (fields) fields.classList.toggle('hidden', !this.showCustomerInfo);
    if (toggle) toggle.textContent = this.showCustomerInfo ? '▼ Hide customer details' : '▶ Add customer details (optional)';
  },

  // ---- Payment selection ----
  selectPayment(method) {
    this.selectedPayment = method;
    document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.querySelector(`.pay-method-btn[data-method="${method}"]`);
    if (btn) btn.classList.add('selected');

    const cashUI = document.getElementById('cash-payment-ui');
    const upiUI  = document.getElementById('upi-payment-ui');

    if (cashUI) cashUI.classList.toggle('hidden', method !== 'CASH');
    if (upiUI)  upiUI.classList.toggle('hidden', method !== 'UPI');
  },

  updateCashChange() {
    if (this.selectedPayment !== 'CASH') return;

    const total = this.getTotal();
    const received = parseFloat(document.getElementById('cash-received-input')?.value) || 0;
    const changeEl = document.getElementById('cash-change-display');
    const errEl    = document.getElementById('cash-error');

    this.cashReceived = received;

    if (!changeEl) return;

    if (received === 0) {
      changeEl.textContent = '₹0.00';
      if (errEl) errEl.textContent = '';
    } else if (received < total) {
      const short = (total - received).toFixed(2);
      changeEl.textContent = '—';
      if (errEl) errEl.textContent = `₹${short} short`;
    } else {
      const change = (received - total).toFixed(2);
      changeEl.textContent = `₹${change}`;
      if (errEl) errEl.textContent = '';
    }
  },

  async generateUPIQR() {
    if (this.cart.length === 0) { showToast('Add items first', 'warning'); return; }

    // Need to create order first to get order ID for UPI
    showToast('Creating order for UPI payment...', 'info');
    const orderResult = await this.submitOrder(false); // create without confirming payment
    if (!orderResult) return;

    const result = await API.generateCounterUPI(orderResult.order.id);
    if (!result.success) { showToast(result.message || 'Failed to generate QR', 'error'); return; }

    this.currentOrderId = orderResult.order.id;
    this.upiQrData = result;

    const img = document.getElementById('upi-qr-img');
    const amount = document.getElementById('upi-amount');

    if (img) img.src = result.qrDataUrl;
    if (amount) amount.textContent = formatCurrency(result.amount);

    showToast('UPI QR generated — ask customer to scan', 'info');
  },

  async verifyUPIPayment() {
    if (!this.currentOrderId) { showToast('No order to verify', 'error'); return; }

    const ref = document.getElementById('upi-ref-input')?.value?.trim() || '';
    const result = await API.verifyCounterUPI(this.currentOrderId, ref);

    if (!result.success) { showToast(result.message || 'Verification failed', 'error'); return; }

    // Show receipt for the already-created order
    const orderData = await API.getOrder(this.currentOrderId);
    if (orderData.success) {
      this.showReceipt(orderData.order, null);
    }
  },

  // ---- Place order ----
  async placeOrder() {
    // Validation
    if (this.cart.length === 0) { showToast('Add at least one item', 'warning'); return; }
    if (!this.customerType) { showToast('Please select customer type', 'warning'); return; }
    if (!this.selectedPayment) { showToast('Please select payment method', 'warning'); return; }

    if (this.selectedPayment === 'CASH') {
      const total = this.getTotal();
      if (!this.cashReceived || this.cashReceived < total) {
        showToast('Cash received must be ≥ total amount', 'error');
        return;
      }
    }

    // Real-time stock check before final submission
    const stockItems = this.cart.map(c => ({ foodItemId: c.foodItemId, quantity: c.quantity }));
    const stockResult = await API.counterStockCheck(stockItems);
    if (!stockResult.success) {
      const msg = stockResult.issues?.map(i => i.message || `Stock issue: ${i.name}`).join(', ') || 'Stock check failed';
      showToast(msg, 'error');
      return;
    }

    if (this.selectedPayment === 'UPI' && !this.currentOrderId) {
      // Let the UPI flow handle it
      await this.generateUPIQR();
      return;
    }

    const orderResult = await this.submitOrder(true);
    if (!orderResult) return;

    if (this.selectedPayment === 'CASH') {
      // Process cash payment
      const cashResult = await API.payCash(orderResult.order.id, this.cashReceived);
      if (!cashResult.success) {
        showToast(cashResult.message || 'Payment failed', 'error');
        return;
      }

      const finalOrder = await API.getOrder(orderResult.order.id);
      this.showReceipt(finalOrder.order || orderResult.order, cashResult);
    }
  },

  async submitOrder(deductStock) {
    const customerName   = document.getElementById('customer-name-input')?.value?.trim() || '';
    const customerMobile = document.getElementById('customer-mobile-input')?.value?.trim() || '';

    const payload = {
      customerType: this.customerType,
      customerName: customerName || null,
      customerMobile: customerMobile || null,
      paymentMethod: this.selectedPayment,
      items: this.cart.map(c => ({ foodItemId: c.foodItemId, quantity: c.quantity })),
    };

    const btn = document.getElementById('btn-place-order');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing...'; }

    const result = await API.createCounterOrder(payload);

    if (btn) { btn.disabled = false; btn.innerHTML = '✓ Confirm Order'; }

    if (!result.success) {
      showToast(result.message || 'Order creation failed', 'error');
      return null;
    }

    return result;
  },

  // ---- Receipt display ----
  showReceipt(order, paymentInfo) {
    const change = paymentInfo?.change ?? 0;
    const received = paymentInfo?.payment?.amount_received ?? 0;

    const itemsHtml = (order.items || []).map(item => `
      <div class="receipt-item-row">
        <span class="receipt-item-name">${escHtml(item.food_name)} × ${item.quantity}</span>
        <span class="receipt-item-price">${formatCurrency(item.subtotal)}</span>
      </div>
    `).join('');

    const cashInfo = order.payment_method === 'CASH' && received ? `
      <div class="receipt-pay-row"><span>Received</span><strong>${formatCurrency(received)}</strong></div>
      <div class="receipt-pay-row"><span>Change</span><strong style="color:var(--success)">${formatCurrency(change)}</strong></div>
    ` : '';

    const receiptHtml = `
      <div class="receipt-overlay" id="receipt-overlay">
        <div class="receipt-card receipt-printable">
          <div class="receipt-header">
            <div class="receipt-canteen-name">🍽️ Smart Canteen</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">${formatDate(order.created_at)}</div>
          </div>

          <hr class="receipt-divider">

          <div class="receipt-token-display">
            <div class="receipt-token-label">Your Token</div>
            <div class="receipt-token">${order.token_number || '—'}</div>
            <div class="receipt-order-number">Order ${order.order_number}</div>
          </div>

          <hr class="receipt-divider">

          <div class="receipt-items">
            ${itemsHtml}
          </div>

          <div class="receipt-total-row">
            <span>TOTAL</span>
            <span class="receipt-total-amount">${formatCurrency(order.total)}</span>
          </div>

          <hr class="receipt-divider">

          <div class="receipt-payment-info">
            <div class="receipt-pay-row"><span>Payment</span><strong>${order.payment_method}</strong></div>
            <div class="receipt-pay-row"><span>Customer</span><strong>${order.customer_type}</strong></div>
            ${order.customer_name ? `<div class="receipt-pay-row"><span>Name</span><strong>${escHtml(order.customer_name)}</strong></div>` : ''}
            ${cashInfo}
          </div>

          <div class="receipt-status-paid">✓ PAID — Order Confirmed</div>
          <div class="receipt-thank-you">Thank You! Please wait for your token to be called.</div>

          <div class="receipt-actions">
            <button class="btn btn-secondary" style="flex:1" onclick="window.print()">🖨️ Print</button>
            <button class="btn btn-primary" style="flex:1" onclick="POS.newOrder()">+ New Order</button>
            <button class="btn btn-ghost" onclick="document.getElementById('receipt-overlay').remove()">✕ Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', receiptHtml);

    // Refresh admin orders list if visible
    if (typeof AdminApp !== 'undefined' && AdminApp.currentSection === 'counter-orders') {
      AdminApp.loadCounterOrders();
    }
  },

  newOrder() {
    const overlay = document.getElementById('receipt-overlay');
    if (overlay) overlay.remove();
    this.reset();
    this.renderCart();
    this.loadMenu();

    // Reset UI state
    document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
    const cashUI = document.getElementById('cash-payment-ui');
    const upiUI = document.getElementById('upi-payment-ui');
    if (cashUI) cashUI.classList.add('hidden');
    if (upiUI) upiUI.classList.add('hidden');

    const cashInput = document.getElementById('cash-received-input');
    if (cashInput) cashInput.value = '';

    showToast('Ready for next order', 'success');
  },
};
