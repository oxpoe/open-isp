'use strict';
/**
 * imageOptimize.js — Konversi otomatis gambar upload (PNG/JPEG) ke WebP agar lebih ringan.
 * Memakai sharp. File yang sudah WebP/GIF tidak dikonversi (GIF dibiarkan agar animasi utuh).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CONVERTIBLE = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.avif']);

function isConvertible(p) {
  return CONVERTIBLE.has(String(path.extname(p || '') || '').toLowerCase());
}

async function webpBuffer(input, opts = {}) {
  const maxWidth = Number(opts.maxWidth) || 1600;
  const quality = Number(opts.quality) || 82;
  let s = sharp(input, { failOn: 'none' }).rotate();
  if (maxWidth > 0) s = s.resize({ width: maxWidth, withoutEnlargement: true });
  return s.webp({ quality, effort: 4 }).toBuffer();
}

/**
 * Konversi file upload PNG/JPEG -> WebP pada folder yang sama.
 * @returns { urlPath, before, after } | null
 */
async function convertUploadToWebp(absPath, urlPrefix, opts = {}) {
  try {
    if (!absPath || !fs.existsSync(absPath) || !isConvertible(absPath)) return null;
    const before = fs.statSync(absPath).size;
    const buf = await webpBuffer(absPath, opts);
    const outAbs = absPath.replace(/\.[^.]+$/, '.webp');
    fs.writeFileSync(outAbs, buf);
    if (outAbs !== absPath) { try { fs.unlinkSync(absPath); } catch (e) {} }
    const urlPath = String(urlPrefix || '').replace(/\/+$/, '') + '/' + path.basename(outAbs);
    return { urlPath, before, after: buf.length };
  } catch (e) {
    return null;
  }
}

/**
 * Tulis 2 varian sekaligus (WebP + JPEG fallback) ke `outBaseAbs` (tanpa ekstensi).
 */
async function writeWebpAndJpg(input, outBaseAbs, opts = {}) {
  const maxWidth = Number(opts.maxWidth) || 1600;
  const quality = Number(opts.quality) || 82;
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const mk = (fmt) => {
    let s = sharp(buf, { failOn: 'none' }).rotate();
    if (maxWidth > 0) s = s.resize({ width: maxWidth, withoutEnlargement: true });
    return fmt === 'webp' ? s.webp({ quality, effort: 4 }).toBuffer() : s.jpeg({ quality, mozjpeg: true }).toBuffer();
  };
  const [webp, jpg] = await Promise.all([mk('webp'), mk('jpg')]);
  fs.writeFileSync(outBaseAbs + '.webp', webp);
  fs.writeFileSync(outBaseAbs + '.jpg', jpg);
  return { webp: webp.length, jpg: jpg.length };
}

module.exports = { convertUploadToWebp, writeWebpAndJpg, webpBuffer, isConvertible };
