/**
 * Voucher Payment API Routes
 * Clean API untuk voucher payment dengan auto-detect payment gateway
 */
const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const db = require('../config/database');
const voucherPaymentSvc = require('../services/voucherPaymentService');
const { getSettingsWithCache } = require('../config/settingsManager');

/**
 * GET /api/voucher/payment-methods
 * Get available payment methods dari semua gateway yang aktif
 */
router.get('/payment-methods', async (req, res) => {
  try {
    const methods = await voucherPaymentSvc.getAvailablePaymentMethods();

    if (!methods || methods.length === 0) {
      return res.status(503).json({
        success: false,
        error: 'Tidak ada payment gateway yang aktif'
      });
    }

    // Group by gateway
    const grouped = {};
    methods.forEach(method => {
      if (!grouped[method.gateway]) {
        grouped[method.gateway] = [];
      }
      grouped[method.gateway].push(method);
    });

    return res.json({
      success: true,
      methods,
      grouped,
      count: methods.length
    });
  } catch (error) {
    logger.error('[VoucherPaymentAPI] Error getting payment methods:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal mengambil payment methods'
    });
  }
});

/**
 * POST /api/voucher/create-payment
 * Create voucher payment transaction
 */
router.post('/create-payment', async (req, res) => {
  try {
    const { voucherOrderId, paymentMethod, appUrl } = req.body;

    // Validate input
    if (!voucherOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Voucher order ID diperlukan'
      });
    }

    if (!paymentMethod || !paymentMethod.gateway || !paymentMethod.code) {
      return res.status(400).json({
        success: false,
        error: 'Payment method tidak valid'
      });
    }

    // Get voucher order
    const voucherOrder = db.prepare(
      'SELECT * FROM public_voucher_orders WHERE id = ?'
    ).get(voucherOrderId);

    if (!voucherOrder) {
      return res.status(404).json({
        success: false,
        error: 'Voucher order tidak ditemukan'
      });
    }

    if (voucherOrder.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Voucher order sudah ${voucherOrder.status}`
      });
    }

    // Create payment
    const result = await voucherPaymentSvc.createVoucherPayment(
      voucherOrder,
      paymentMethod,
      appUrl
    );

    // Update voucher order dengan payment info
    db.prepare(`
      UPDATE public_voucher_orders
      SET payment_gateway = ?,
          payment_order_id = ?,
          payment_link = ?,
          payment_reference = ?,
          payment_method = ?,
          payment_payload = ?,
          updated_at = (NOW_LOCAL())
      WHERE id = ?
    `).run(
      result.gateway,
      result.orderId || '',
      result.link || '',
      result.reference || '',
      paymentMethod.code,
      result.payload ? JSON.stringify(result.payload) : null,
      voucherOrderId
    );

    logger.info(`[VoucherPaymentAPI] Payment created for voucher order ${voucherOrderId}`, {
      gateway: result.gateway,
      method: paymentMethod.code,
      amount: voucherOrder.price
    });

    return res.json({
      success: true,
      gateway: result.gateway,
      paymentMethod: result.paymentMethod,
      link: result.link,
      reference: result.reference,
      orderId: result.orderId
    });
  } catch (error) {
    logger.error('[VoucherPaymentAPI] Error creating payment:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Gagal membuat payment'
    });
  }
});

/**
 * GET /api/voucher/order/:orderId
 * Get voucher order details
 */
router.get('/order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;

    const order = db.prepare(
      'SELECT * FROM public_voucher_orders WHERE id = ?'
    ).get(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Voucher order tidak ditemukan'
      });
    }

    return res.json({
      success: true,
      order: {
        id: order.id,
        profileName: order.profile_name,
        price: order.price,
        status: order.status,
        paymentGateway: order.payment_gateway,
        paymentMethod: order.payment_method,
        buyerPhone: order.buyer_phone,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        fulfilledAt: order.fulfilled_at,
        voucherCode: order.status === 'fulfilled' ? order.voucher_code : null
      }
    });
  } catch (error) {
    logger.error('[VoucherPaymentAPI] Error getting order:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal mengambil order details'
    });
  }
});

/**
 * GET /api/voucher/default-gateway
 * Get default payment gateway
 */
router.get('/default-gateway', (req, res) => {
  try {
    const gateway = voucherPaymentSvc.getDefaultPaymentGateway();

    if (!gateway) {
      return res.status(503).json({
        success: false,
        error: 'Tidak ada payment gateway yang aktif'
      });
    }

    return res.json({
      success: true,
      gateway
    });
  } catch (error) {
    logger.error('[VoucherPaymentAPI] Error getting default gateway:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal mengambil default gateway'
    });
  }
});

/**
 * GET /api/voucher/status/:orderId
 * Get voucher order status
 */
router.get('/status/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;

    const order = db.prepare(
      'SELECT id, status, voucher_code, payment_gateway FROM public_voucher_orders WHERE id = ?'
    ).get(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Voucher order tidak ditemukan'
      });
    }

    return res.json({
      success: true,
      status: order.status,
      voucherCode: order.status === 'fulfilled' ? order.voucher_code : null,
      paymentGateway: order.payment_gateway
    });
  } catch (error) {
    logger.error('[VoucherPaymentAPI] Error getting status:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal mengambil status'
    });
  }
});

module.exports = router;
