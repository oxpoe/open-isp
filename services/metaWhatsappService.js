const { logger } = require('../config/logger');
const { getSetting } = require('../config/settingsManager');
const db = require('../config/database');

/**
 * Service untuk Meta WhatsApp Cloud API (Official Meta Graph API)
 */

/**
 * Format nomor telepon ke format E.164 tanpa tanda '+' (misal 628123456789)
 */
function normalizePhone(phone) {
  let cleaned = String(phone || '').replace(/\D/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Verifikasi Webhook dari Meta (GET request saat pendaftaran Webhook di Meta Developer Console)
 */
function verifyWebhook(req, res) {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const configuredVerifyToken = getSetting('meta_verify_token', 'antigravity_meta_wa_secret');

    if (mode === 'subscribe' && token === configuredVerifyToken) {
      logger.info('[Meta WA Webhook] Webhook successfully verified by Meta!');
      return res.status(200).send(challenge);
    } else {
      logger.warn('[Meta WA Webhook] Webhook verification failed! Invalid token.');
      return res.sendStatus(403);
    }
  } catch (err) {
    logger.error('[Meta WA Webhook] Verification error:', err.message);
    return res.sendStatus(500);
  }
}

/**
 * Memproses Event Masuk dari Meta Webhook (Pesan Baru & Status Delivery)
 */
async function processWebhookEvent(req, res) {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        // 1. Tangani Pesan Masuk dari Pelanggan
        if (value.messages && value.messages.length > 0) {
          for (const msg of value.messages) {
            const senderPhone = msg.from; // format: 628123456789
            const msgId = msg.id;
            let msgText = '';

            if (msg.type === 'text' && msg.text) {
              msgText = msg.text.body;
            } else if (msg.type === 'button' && msg.button) {
              msgText = msg.button.text;
            } else if (msg.type === 'interactive' && msg.interactive) {
              msgText = msg.interactive.button_reply?.title || msg.interactive.list_reply?.title || 'Interactive response';
            } else {
              msgText = `[Pesan ${msg.type}]`;
            }

            logger.info(`[Meta WA Webhook] Pesan masuk dari ${senderPhone}: "${msgText}"`);

            // Cari nama pelanggan dari DB jika ada
            let customerName = 'Pelanggan';
            let customerId = null;
            try {
              const cust = db.prepare('SELECT id, name FROM customers WHERE phone LIKE ? OR phone LIKE ?').get(`%${senderPhone.slice(-8)}%`, `%${senderPhone}%`);
              if (cust) {
                customerName = cust.name;
                customerId = cust.id;
              }
            } catch (e) {}

            // Simpan ke tabel wa_chat_messages
            try {
              db.prepare(`
                INSERT INTO wa_chat_messages 
                (direction, gateway, sender_phone, recipient_phone, customer_id, customer_name, message_text, status, meta_message_id)
                VALUES ('inbound', 'meta', ?, ?, ?, ?, ?, 'read', ?)
              `).run(senderPhone, getSetting('meta_business_phone', ''), customerId, customerName, msgText, msgId);
            } catch (dbErr) {
              logger.error('[Meta WA DB Error] Gagal simpan pesan masuk:', dbErr.message);
            }
          }
        }

        // 2. Tangani Update Status Pengiriman (Sent, Delivered, Read, Failed)
        if (value.statuses && value.statuses.length > 0) {
          for (const statusObj of value.statuses) {
            const statusId = statusObj.id;
            const newStatus = statusObj.status; // sent, delivered, read, failed

            try {
              db.prepare(`UPDATE wa_chat_messages SET status = ? WHERE meta_message_id = ?`).run(newStatus, statusId);
            } catch (e) {}
          }
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    logger.error('[Meta WA Webhook] Error processing webhook event:', err.message);
    return res.status(500).send('ERROR');
  }
}

/**
 * Kirim Pesan Teks Bebas via Meta Cloud API (Graph API)
 */
async function sendMetaTextMessage(toPhone, messageText) {
  const phone = normalizePhone(toPhone);
  if (!phone) throw new Error('Nomor tujuan tidak valid.');

  const phoneNumberId = getSetting('meta_phone_number_id', '');
  const accessToken = getSetting('meta_access_token', '');

  if (!phoneNumberId || !accessToken) {
    throw new Error('Meta Cloud API belum dikonfigurasi. Harap isi Phone Number ID dan Access Token di Pengaturan WA.');
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: {
      preview_url: false,
      body: String(messageText || '')
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resData = await response.json();

  if (!response.ok) {
    const errMessage = resData?.error?.message || resData?.error?.error_user_msg || JSON.stringify(resData);
    logger.error(`[Meta WA API Error] ${errMessage}`);
    throw new Error(`Meta API Error: ${errMessage}`);
  }

  const metaMsgId = resData?.messages?.[0]?.id || '';

  // Simpan ke DB Chat Log
  try {
    let custName = 'Pelanggan';
    let custId = null;
    const cust = db.prepare('SELECT id, name FROM customers WHERE phone LIKE ? OR phone LIKE ?').get(`%${phone.slice(-8)}%`, `%${phone}%`);
    if (cust) {
      custName = cust.name;
      custId = cust.id;
    }

    db.prepare(`
      INSERT INTO wa_chat_messages 
      (direction, gateway, sender_phone, recipient_phone, customer_id, customer_name, message_text, status, meta_message_id)
      VALUES ('outbound', 'meta', ?, ?, ?, ?, ?, 'sent', ?)
    `).run(getSetting('meta_business_phone', ''), phone, custId, custName, messageText, metaMsgId);
  } catch (e) {}

  return { success: true, messageId: metaMsgId, raw: resData };
}

/**
 * Kirim Pesan Template Resmi via Meta Cloud API
 * @param {string} toPhone 
 * @param {string} templateName Nama template terdaftar di Meta
 * @param {string} languageCode Kode bahasa, misal 'id'
 * @param {Array} parameters Array parameter string misal ["Budi", "Rp 150.000", "10 Aug"]
 */
async function sendMetaTemplateMessage(toPhone, templateName, languageCode = 'id', parameters = []) {
  const phone = normalizePhone(toPhone);
  if (!phone) throw new Error('Nomor tujuan tidak valid.');

  const phoneNumberId = getSetting('meta_phone_number_id', '');
  const accessToken = getSetting('meta_access_token', '');

  if (!phoneNumberId || !accessToken) {
    throw new Error('Meta Cloud API belum dikonfigurasi. Harap isi Phone Number ID dan Access Token di Pengaturan WA.');
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const components = [];
  if (Array.isArray(parameters) && parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters.map(val => ({
        type: 'text',
        text: String(val || '')
      }))
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components: components
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resData = await response.json();

  if (!response.ok) {
    const errMessage = resData?.error?.message || resData?.error?.error_user_msg || JSON.stringify(resData);
    logger.error(`[Meta WA API Error] ${errMessage}`);
    throw new Error(`Meta API Error: ${errMessage}`);
  }

  const metaMsgId = resData?.messages?.[0]?.id || '';

  // Simpan ke DB Chat Log
  try {
    let custName = 'Pelanggan';
    let custId = null;
    const cust = db.prepare('SELECT id, name FROM customers WHERE phone LIKE ? OR phone LIKE ?').get(`%${phone.slice(-8)}%`, `%${phone}%`);
    if (cust) {
      custName = cust.name;
      custId = cust.id;
    }

    const summaryText = `[Template Meta: ${templateName}] Parameter: ${parameters.join(', ')}`;
    db.prepare(`
      INSERT INTO wa_chat_messages 
      (direction, gateway, sender_phone, recipient_phone, customer_id, customer_name, message_text, status, meta_message_id)
      VALUES ('outbound', 'meta', ?, ?, ?, ?, ?, 'sent', ?)
    `).run(getSetting('meta_business_phone', ''), phone, custId, custName, summaryText, metaMsgId);
  } catch (e) {}

  return { success: true, messageId: metaMsgId, raw: resData };
}

module.exports = {
  normalizePhone,
  verifyWebhook,
  processWebhookEvent,
  sendMetaTextMessage,
  sendMetaTemplateMessage
};
