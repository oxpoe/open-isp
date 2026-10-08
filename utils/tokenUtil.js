/**
 * Token utility untuk public payment tokens
 * Digunakan untuk polling status pembayaran tanpa memerlukan session login
 */
const crypto = require('crypto');

/**
 * Sign public token untuk payment (HMAC-SHA256)
 * @param {Object} payload - Data: {invoiceId, customerId, lookup, exp}
 * @param {string} secret - Session secret
 * @returns {string} Base64-encoded token
 */
function signPublicToken(payload, secret) {
  try {
    const json = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret || 'default-secret')
      .update(json)
      .digest('hex');
    
    const tokenData = {
      data: json,
      sig: signature
    };
    
    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  } catch (e) {
    console.error('[signPublicToken] Error:', e.message);
    return '';
  }
}

/**
 * Verify public token
 * @param {string} token - Base64-encoded token
 * @param {string} secret - Session secret
 * @returns {Object|null} Payload if valid, null if invalid/expired
 */
function verifyPublicToken(token, secret) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const tokenData = JSON.parse(decoded);
    
    const { data, sig } = tokenData;
    const expectedSig = crypto
      .createHmac('sha256', secret || 'default-secret')
      .update(data)
      .digest('hex');
    
    if (sig !== expectedSig) {
      return null;
    }
    
    const payload = JSON.parse(data);
    
    // Check expiry
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    
    return payload;
  } catch (e) {
    console.error('[verifyPublicToken] Error:', e.message);
    return null;
  }
}

module.exports = {
  signPublicToken,
  verifyPublicToken
};
