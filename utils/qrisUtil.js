const fs = require('fs');
const path = require('path');
const jimpMod = require('jimp');
const Jimp = jimpMod.Jimp || jimpMod;
const jsQR = require('jsqr');
const QRCode = require('qrcode');
const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatReader, BarcodeFormat, DecodeHintType } = require('@zxing/library');

function normalizeQrisPayload(raw) {
  let s = String(raw || '').replace(/[\r\n\t]+/g, '').trim();
  const idx = s.indexOf('000201');
  if (idx > 0) s = s.slice(idx);
  const lastCrc = s.lastIndexOf('6304');
  if (lastCrc >= 0 && s.length >= lastCrc + 8) {
    s = s.slice(0, lastCrc + 8);
  }
  return s;
}

function crc16CcittFalse(input) {
  const s = String(input || '');
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= (s.charCodeAt(i) & 0xff) << 8;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function parseEmvTlvString(input) {
  const raw = String(input || '').replace(/[\r\n\t]+/g, '').trim();
  if (!raw) throw new Error('QRIS payload kosong');
  if (raw.length < 8) throw new Error('QRIS payload terlalu pendek');

  const items = [];
  let i = 0;
  while (i < raw.length) {
    if (i + 4 > raw.length) throw new Error('QRIS payload TLV tidak valid');
    const tag = raw.slice(i, i + 2);
    const lenStr = raw.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(lenStr)) throw new Error('QRIS payload TLV length tidak valid');
    const len = Number(lenStr);
    const start = i + 4;
    const end = start + len;
    if (end > raw.length) throw new Error('QRIS payload TLV length melebihi data');
    const value = raw.slice(start, end);
    items.push({ tag, value });
    i = end;
  }
  return items;
}

function buildEmvTlvString(items) {
  const list = Array.isArray(items) ? items : [];
  let out = '';
  for (const it of list) {
    const tag = String(it?.tag || '');
    const value = String(it?.value ?? '');
    const len = value.length;
    if (!/^\d{2}$/.test(tag)) throw new Error('Tag TLV tidak valid');
    if (len > 99) throw new Error('TLV length > 99 tidak didukung');
    out += tag + String(len).padStart(2, '0') + value;
  }
  return out;
}

function convertStaticQrisToDynamic(staticPayload, amount) {
  const amt = Math.max(0, Math.floor(Number(amount || 0) || 0));
  if (!amt) throw new Error('Nominal QRIS dinamis tidak valid');

  const source = parseEmvTlvString(staticPayload)
    .filter(x => x && x.tag)
    .map(x => ({ tag: String(x.tag), value: String(x.value ?? '') }));

  const managed = new Set(['54', '55', '56', '57', '63']);
  const result = [];
  let amountInserted = false;

  for (const el of source) {
    if (managed.has(el.tag)) continue;
    if (el.tag === '01') {
      result.push({ tag: '01', value: '12' });
      continue;
    }
    if (el.tag === '58' && !amountInserted) {
      result.push({ tag: '54', value: String(amt) });
      amountInserted = true;
    }
    result.push(el);
  }

  if (!amountInserted) {
    result.push({ tag: '54', value: String(amt) });
  }

  const body = buildEmvTlvString(result);
  const partial = body + '6304';
  const crc = crc16CcittFalse(partial).toString(16).toUpperCase().padStart(4, '0');
  return partial + crc;
}

async function decodeQrisPayloadFromBuffer(buf) {
  if (!buf || !buf.length) return '';

  // 1. Try jsQR (Fast & reliable for screenshots)
  try {
    const img = await Jimp.read(buf);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    const data = new Uint8ClampedArray(img.bitmap.data);
    const code = jsQR(data, w, h);
    if (code && code.data) {
      const payload = normalizeQrisPayload(code.data);
      if (payload && payload.startsWith('000201')) return payload;
    }
  } catch (e) {}

  // 2. Fallback to @zxing/library
  try {
    const img = await Jimp.read(buf);
    const rgba = new Uint8ClampedArray(img.bitmap.data.buffer, img.bitmap.data.byteOffset, img.bitmap.data.byteLength);
    const source = new RGBLuminanceSource(rgba, img.bitmap.width, img.bitmap.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);
    const decoded = reader.decode(bitmap, hints);
    const text = typeof decoded?.getText === 'function' ? decoded.getText() : String(decoded?.text || '');
    const payload = normalizeQrisPayload(text);
    if (payload && payload.startsWith('000201')) return payload;
  } catch (e) {}

  return '';
}

async function buildDynamicQrisJpgBuffer(staticPayload, amount) {
  const dynamic = convertStaticQrisToDynamic(staticPayload, amount);
  const png = await QRCode.toBuffer(dynamic, { errorCorrectionLevel: 'M', margin: 1, width: 420, type: 'png' });
  const img = await Jimp.read(png);
  return await img.getBuffer('image/jpeg');
}

module.exports = {
  normalizeQrisPayload,
  crc16CcittFalse,
  parseEmvTlvString,
  buildEmvTlvString,
  convertStaticQrisToDynamic,
  decodeQrisPayloadFromBuffer,
  buildDynamicQrisJpgBuffer
};
