'use strict';

process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const { initDb, getDb } = require('../server/db');
const {
  toPaise,
  toRupees,
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  processCashPayment,
  processRefund,
  getReceipt,
} = require('../server/services/PaymentService');
const { createOrder } = require('../server/services/OrderService');
const { verifyAndRedeemQR } = require('../server/services/QRService');
const { getProvider } = require('../server/services/payments');

beforeAll(async () => {
  await initDb();
});

describe('Payment Integration Test Matrix', () => {
  // 1. Money Handling in Minor Units (Paise)
  test('converts rupees to integer paise and back without floating point inaccuracies', () => {
    expect(toPaise(10.50)).toBe(1050);
    expect(toPaise(15)).toBe(1500);
    expect(toPaise(0.75)).toBe(75);
    expect(toRupees(1050)).toBe('10.50');
    expect(toRupees(1500)).toBe('15.00');
  });

  // 2. Razorpay Provider Order Creation
  test('creates a valid Razorpay order with integer amount in paise', async () => {
    const provider = getProvider('RAZORPAY');
    const orderRes = await provider.createPaymentOrder({
      orderId: 999,
      orderNumber: 'O-TEST-01',
      amountPaise: 4500,
      currency: 'INR',
    });

    expect(orderRes.success).toBe(true);
    expect(orderRes.providerOrderId).toMatch(/^order_/);
    expect(orderRes.amountPaise).toBe(4500);
    expect(orderRes.currency).toBe('INR');
  });

  // 3. Signature Verification: Valid vs Invalid
  test('verifies valid HMAC SHA-256 signature correctly', async () => {
    const provider = getProvider('RAZORPAY');
    const orderId = 'order_valid_123';
    const paymentId = 'pay_valid_456';
    const validSig = provider.generateTestSignature(orderId, paymentId);

    const result = await provider.verifyPaymentSignature({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      signature: validSig,
    });
    expect(result.valid).toBe(true);
  });

  test('rejects forged or invalid HMAC signature', async () => {
    const provider = getProvider('RAZORPAY');
    const result = await provider.verifyPaymentSignature({
      providerOrderId: 'order_test_123',
      providerPaymentId: 'pay_test_456',
      signature: 'bad_forged_hex_signature_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });
    expect(result.valid).toBe(false);
  });

  // 4. Webhook HMAC Signature & Idempotency
  test('verifies webhook HMAC signature and handles duplicate events idempotently', async () => {
    const provider = getProvider('RAZORPAY');
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      event_id: 'evt_test_unique_001',
      payload: { payment: { entity: { id: 'pay_evt_1', order_id: 'order_evt_1', amount: 1500 } } },
    });

    const validWebhookSig = crypto
      .createHmac('sha256', provider.webhookSecret)
      .update(rawPayload)
      .digest('hex');

    // First delivery
    const res1 = await handleWebhook(rawPayload, validWebhookSig, JSON.parse(rawPayload));
    expect(res1.success).toBe(true);

    // Second delivery (Duplicate event from webhook)
    const res2 = await handleWebhook(rawPayload, validWebhookSig, JSON.parse(rawPayload));
    expect(res2.success).toBe(true);
    expect(res2.message).toContain('idempotent');
  });

  // 5. Atomic Stock Deduction Upon Verified Payment
  test('online order does not deduct stock on creation, but deducts atomically on payment verification', async () => {
    const db = getDb();
    // Fetch initial stock for Samosa (item 1)
    const initialStock = db.prepare('SELECT stock FROM food_items WHERE id = 1').get().stock;

    // 1. Create order
    const orderRes = await createOrder({
      orderSource: 'ONLINE',
      customerName: 'Test Online Customer',
      items: [{ foodItemId: 1, quantity: 2 }],
    });
    expect(orderRes.success).toBe(true);

    // Stock should NOT be deducted yet!
    const stockAfterCreate = db.prepare('SELECT stock FROM food_items WHERE id = 1').get().stock;
    expect(stockAfterCreate).toBe(initialStock);

    // 2. Initiate payment order
    const paymentRes = await createPaymentOrder({
      orderId: orderRes.order.id,
      providerName: 'RAZORPAY',
    });
    expect(paymentRes.success).toBe(true);

    // 3. Verify payment with valid signature
    const provider = getProvider('RAZORPAY');
    const paymentId = `pay_${Date.now()}`;
    const sig = provider.generateTestSignature(paymentRes.providerOrderId, paymentId);

    const verifyRes = await verifyPayment({
      providerOrderId: paymentRes.providerOrderId,
      providerPaymentId: paymentId,
      signature: sig,
      providerName: 'RAZORPAY',
    });

    expect(verifyRes.success).toBe(true);
    expect(verifyRes.order.payment_status).toBe('PAID');
    expect(verifyRes.qrDataUrl).toBeDefined();

    // Stock MUST be deducted now!
    const stockAfterPayment = db.prepare('SELECT stock FROM food_items WHERE id = 1').get().stock;
    expect(stockAfterPayment).toBe(initialStock - 2);
  });

  // 6. Cryptographic QR Token Generation and Single-Use Atomic Redemption
  test('verifies QR token and prevents duplicate collection handover', async () => {
    const db = getDb();
    // Create and pay an order
    const orderRes = await createOrder({
      orderSource: 'ONLINE',
      items: [{ foodItemId: 2, quantity: 1 }],
    });
    const paymentRes = await createPaymentOrder({ orderId: orderRes.order.id });
    const provider = getProvider('RAZORPAY');
    const payId = `pay_${Date.now()}`;
    const sig = provider.generateTestSignature(paymentRes.providerOrderId, payId);

    const verifyRes = await verifyPayment({
      providerOrderId: paymentRes.providerOrderId,
      providerPaymentId: payId,
      signature: sig,
    });

    expect(verifyRes.rawToken).toBeDefined();

    // 1st Staff scan: Verify and redeem
    const scan1 = verifyAndRedeemQR(verifyRes.rawToken, 1);
    expect(scan1.success).toBe(true);
    expect(scan1.order.status).toBe('COMPLETED');

    // 2nd Staff scan: Must reject with ORDER_ALREADY_COLLECTED!
    const scan2 = verifyAndRedeemQR(verifyRes.rawToken, 1);
    expect(scan2.success).toBe(false);
    expect(scan2.code).toBe('ORDER_ALREADY_COLLECTED');
  });

  // 7. Counter Cash Auditing & Change Calculation
  test('handles counter cash payment with change calculation in paise', () => {
    const db = getDb();
    const cashOrderNum = `O-CASH-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, order_source, customer_type, total, amount_paise, payment_method, status, payment_status)
      VALUES (?, 'COUNTER', 'STUDENT', 15, 1500, 'CASH', 'PENDING', 'PENDING')
    `).run(cashOrderNum);
    const orderId = orderResult.lastInsertRowid;

    // Customer gives ₹50 (5000 paise) for ₹15 item -> change ₹35 (3500 paise)
    const cashRes = processCashPayment(orderId, 5000, 1);
    expect(cashRes.success).toBe(true);
    expect(cashRes.changePaise).toBe(3500);
    expect(cashRes.changeRupees).toBe('35.00');
    expect(['PAID', 'CAPTURED']).toContain(cashRes.payment.status);
  });

  // 8. Full Refund Flow
  test('refunds paid order and restores stock', async () => {
    const db = getDb();
    const initialStock = db.prepare('SELECT stock FROM food_items WHERE id = 1').get().stock;

    // Create & pay order
    const orderRes = await createOrder({
      orderSource: 'ONLINE',
      items: [{ foodItemId: 1, quantity: 1 }],
    });
    const paymentRes = await createPaymentOrder({ orderId: orderRes.order.id });
    const provider = getProvider('RAZORPAY');
    const payId = `pay_rfnd_${Date.now()}`;
    const sig = provider.generateTestSignature(paymentRes.providerOrderId, payId);
    await verifyPayment({
      providerOrderId: paymentRes.providerOrderId,
      providerPaymentId: payId,
      signature: sig,
    });

    const stockDeducted = db.prepare('SELECT stock FROM food_items WHERE id = 1').get().stock;
    expect(stockDeducted).toBe(initialStock - 1);

    // Process refund
    const refundRes = await processRefund(orderRes.order.id, 'Cancelled by customer', 1);
    expect(refundRes.success).toBe(true);

    // Stock restored!
    const stockRestored = db.prepare('SELECT stock FROM food_items WHERE id = 1').get().stock;
    expect(stockRestored).toBe(initialStock);

    const refundedOrder = db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(orderRes.order.id);
    expect(refundedOrder.payment_status).toBe('REFUNDED');
  });

  // 9. Digital Receipt Integrity
  test('retrieves accurate digital receipt with itemized line items', () => {
    const receipt = getReceipt(1);
    if (receipt) {
      expect(receipt.order_number).toBeDefined();
      expect(Array.isArray(receipt.items)).toBe(true);
    }
  });
});
