// services/qr.service.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PUBLIC_QR_DIR = path.join(process.cwd(), 'public', 'qr');
ensureDir(PUBLIC_QR_DIR);

/* ----------------------------- helpers ----------------------------- */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function hashText(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 16);
}
function normalizeOptions(opt = {}) {
  const {
    width = 256,
    margin = 1,
    errorCorrectionLevel = 'M', // L, M, Q, H
    color = { dark: '#000000', light: '#FFFFFF' },
    type, // allow override (e.g. 'svg')
  } = opt;

  const out = {
    width: Number(width) || 256,
    margin: Number.isFinite(Number(margin)) ? Number(margin) : 1,
    errorCorrectionLevel,
    color,
  };
  if (type) out.type = type;
  return out;
}

/** Xây URL /bills/:id/print từ Setting.eReceipt.baseUrl (nếu có) hoặc từ req.host */
function buildBillPrintUrl({ req, setting, billId }) {
  const id = encodeURIComponent(String(billId));
  const base = setting?.eReceipt?.baseUrl?.trim();
  if (base) {
    return `${base.replace(/\/+$/, '')}/bills/${id}/print`;
  }
  // fallback: dùng host hiện tại (API v1)
  const origin = `${req.protocol}://${req.get('host')}`;
  return `${origin}/api/v1/bills/${id}/print`;
}

/* ----------------------------- core gen ---------------------------- */
/** Tạo PNG Buffer từ chuỗi text */
async function toPngBuffer(text, opt = {}) {
  const o = normalizeOptions(opt);
  return QRCode.toBuffer(String(text || ''), { type: 'png', ...o });
}
/** Tạo DataURL (PNG) từ text */
async function toDataURL(text, opt = {}) {
  const o = normalizeOptions(opt);
  return QRCode.toDataURL(String(text || ''), { type: 'png', ...o });
}
/** Tạo SVG string từ text (vector) */
async function toSvgString(text, opt = {}) {
  const o = normalizeOptions({ ...opt, type: 'svg' });
  return QRCode.toString(String(text || ''), o);
}

/* -------------------------- save utilities ------------------------- */
/** Lưu ảnh PNG vào đường dẫn chỉ định */
async function savePng(text, filePath, opt = {}) {
  const buf = await toPngBuffer(text, opt);
  ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, buf);
  return { filePath, size: buf.length };
}
/** Lưu PNG vào public/qr để FE truy cập; trả về publicPath và filePath */
async function savePngToPublic(text, { filename, subdir = '' } = {}, opt = {}) {
  const o = normalizeOptions(opt);
  const name = filename || `${hashText(text)}_${o.width}.png`;
  const dir = path.join(PUBLIC_QR_DIR, subdir);
  ensureDir(dir);

  const filePath = path.join(dir, name);
  const buf = await QRCode.toBuffer(String(text || ''), { type: 'png', ...o });
  await fs.promises.writeFile(filePath, buf);

  const relDir = subdir ? `/qr/${subdir.replace(/^[\\/]+|[\\/]+$/g, '')}` : '/qr';
  const publicPath = `${relDir}/${name}`;
  return { filePath, publicPath, size: buf.length };
}

/* --------------------------- express helper ------------------------ */
async function respondPng(res, text, opt = {}) {
  const buf = await toPngBuffer(text, opt);
  res.set('Content-Type', 'image/png');
  res.send(buf);
}

/* ---------------------- bill-specific convenience ------------------ */
async function billPngBuffer({ req, setting, billId, width = 256, margin = 1, errorCorrectionLevel = 'M' }) {
  const url = buildBillPrintUrl({ req, setting, billId });
  return toPngBuffer(url, { width, margin, errorCorrectionLevel });
}
async function billPngPublic({ req, setting, billId, subdir = 'bills', width = 256, margin = 1, errorCorrectionLevel = 'M' }) {
  const url = buildBillPrintUrl({ req, setting, billId });
  const filename = `bill_${billId}_${width}.png`;
  return savePngToPublic(url, { filename, subdir }, { width, margin, errorCorrectionLevel });
}

/* ------------------ compatibility with bill.controller ------------- */
/** Compatible alias: returns { buffer } */
async function generateQRCodePNG(text, opt = {}) {
  const buffer = await toPngBuffer(text, opt);
  return { buffer };
}
/** Compatible alias: returns Buffer directly */
async function qrPngBuffer(text, opt = {}) {
  return toPngBuffer(text, opt);
}

/* -------------------------------- export --------------------------- */
module.exports = {
  // URL builders
  buildBillPrintUrl,

  // Core generators
  toPngBuffer,
  toDataURL,
  toSvgString,

  // Save helpers
  savePng,
  savePngToPublic,

  // Express helper
  respondPng,

  // Bill-specific helpers
  billPngBuffer,
  billPngPublic,

  // Compatibility (used by controllers/bill.controller.js)
  generateQRCodePNG,
  qrPngBuffer,

  // Constants
  PUBLIC_QR_DIR,
};
