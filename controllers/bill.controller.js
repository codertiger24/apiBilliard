// controllers/bill.controller.js
const path = require('path');
const R = require('../utils/response');
const Bill = require('../models/bill.model');
const { ensureRange } = require('../utils/time');

function safeRequire(p) {
  try { return require(p); } catch { return null; }
}
const Exporter = safeRequire('../services/export.service');   // export Excel/PDF (optional)
const QR = safeRequire('../services/qr.service');             // QR generator (optional)
const Billing = safeRequire('../services/billing.service');   // to fetch eReceipt setting
const { getActiveSetting } = Billing || {};

/* ====================== Helpers ====================== */

function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function parseSort(sortStr = '-createdAt') {
  if (!sortStr || typeof sortStr !== 'string') return { createdAt: -1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({
  q, table, staff, branchId, paid, paymentMethod, from, to, minTotal, maxTotal,
}) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ code: rx }, { tableName: rx }, { note: rx }];
  }
  if (table) query.table = table;
  if (staff) query.staff = staff;
  if (branchId) query.branchId = branchId;

  if (typeof paid === 'boolean' || paid === 'true' || paid === 'false') {
    query.paid = String(paid) === 'true' || paid === true;
  }
  if (paymentMethod) query.paymentMethod = paymentMethod;

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const hasMin = typeof minTotal !== 'undefined' && minTotal !== null && minTotal !== '';
  const hasMax = typeof maxTotal !== 'undefined' && maxTotal !== null && maxTotal !== '';
  if (hasMin || hasMax) {
    query.total = {};
    if (hasMin) query.total.$gte = Number(minTotal);
    if (hasMax) query.total.$lte = Number(maxTotal);
  }

  return query;
}

/* ====================== Controllers ====================== */

// GET /bills
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    table,
    staff,
    branchId,
    paid,
    paymentMethod,
    from,
    to,
    minTotal,
    maxTotal,
    sort = '-createdAt',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(500, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({
    q, table, staff, branchId, paid, paymentMethod, from, to, minTotal, maxTotal,
  });
  const sortObj = parseSort(String(sort));

  const [items, total] = await Promise.all([
    Bill.find(query)
      .populate('table', 'name')
      .populate('staff', 'name username')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum),
    Bill.countDocuments(query),
  ]);

  return R.paged(res, {
    items: items.map(sanitize),
    page: pageNum,
    limit: limitNum,
    total,
    sort,
  });
});

// GET /bills/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const doc = await Bill.findById(req.params.id)
    .populate('table', 'name')
    .populate('staff', 'name username');
  if (!doc) return R.fail(res, 404, 'Bill not found');
  return R.ok(res, sanitize(doc));
});

// PATCH /bills/:id/pay
exports.pay = R.asyncHandler(async (req, res) => {
  const { paymentMethod = 'cash', paidAt } = req.body;

  const doc = await Bill.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Bill not found');

  doc.paid = true;
  doc.paymentMethod = paymentMethod;
  doc.paidAt = paidAt ? new Date(paidAt) : (doc.paidAt || new Date());

  await doc.save();
  return R.ok(res, sanitize(doc), 'Bill marked as paid');
});

// PATCH /bills/:id/note
exports.setNote = R.asyncHandler(async (req, res) => {
  const { note = '' } = req.body;
  const doc = await Bill.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Bill not found');

  doc.note = note;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Note updated');
});

// GET /bills/export.xlsx
exports.exportExcel = R.asyncHandler(async (req, res) => {
  // gom dữ liệu theo filter, mặc định trong hôm nay nếu không truyền from/to
  const { from: qFrom, to: qTo, branchId, paidOnly = 'true' } = req.query;
  const range = ensureRange({ from: qFrom, to: qTo });

  const query = buildQuery({
    branchId,
    paid: String(paidOnly) === 'true',
    from: range.from,
    to: range.to,
  });

  // Limit an toàn để export
  const MAX_EXPORT = Number(process.env.MAX_EXPORT_ROWS || 10000);
  const items = await Bill.find(query).sort({ createdAt: 1 }).limit(MAX_EXPORT).lean();

  if (!Exporter || typeof Exporter.exportBillsToExcel !== 'function') {
    // Fallback: trả JSON nếu service chưa sẵn
    return R.ok(res, {
      note: 'Export service is not available, returning JSON fallback',
      count: items.length,
      from: range.from,
      to: range.to,
      items,
    });
  }

  const fileLabel = `${range.from.toISOString().slice(0, 10)}_to_${range.to
    .toISOString()
    .slice(0, 10)}`;
  const { filePath, fileName } = await Exporter.exportBillsToExcel(items, {
    fileName: `bills_${fileLabel}.xlsx`,
  });

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName || path.basename(filePath)}"`
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  return res.sendFile(path.resolve(filePath));
});

// GET /bills/:id/print?paperSize=80mm&embedQR=true
exports.print = R.asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paperSize = '80mm', embedQR = 'true' } = req.query;

  const bill = await Bill.findById(id)
    .populate('table', 'name')
    .populate('staff', 'name username')
    .lean();
  if (!bill) return R.fail(res, 404, 'Bill not found');

  if (!Exporter || typeof Exporter.renderBillPDF !== 'function') {
    // Fallback khi chưa có module in: trả JSON để FE tự hiển thị
    return R.ok(
      res,
      { bill, paperSize, embedQR: String(embedQR) === 'true' },
      'Print service not available'
    );
  }

  // Lấy cấu hình in/branding nếu cần
  let setting = null;
  if (typeof getActiveSetting === 'function') {
    setting = await getActiveSetting(bill.branchId || null);
  }

  const { buffer } = await Exporter.renderBillPDF({
    bill,
    setting,
    paperSize: String(paperSize),
    embedQR: String(embedQR) === 'true',
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="bill_${bill.code || bill._id}.pdf"`);
  return res.end(buffer);
});

// GET /bills/:id/qr  → trả ảnh PNG QR code (e-bill link hoặc mã hoá đơn)
exports.qr = R.asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bill = await Bill.findById(id).lean();
  if (!bill) return R.fail(res, 404, 'Bill not found');

  // Tạo đường dẫn e-receipt nếu có baseUrl; fallback dùng code
  let text = bill.code || String(bill._id);
  if (typeof getActiveSetting === 'function') {
    const setting = await getActiveSetting(bill.branchId || null);
    const base = setting?.eReceipt?.baseUrl;
    if (setting?.eReceipt?.enabled && base) {
      const baseNorm = String(base).replace(/\/+$/, '');
      text = `${baseNorm}/bill/${bill._id}`;
    }
  }

  if (QR && typeof QR.generateQRCodePNG === 'function') {
    const { buffer } = await QR.generateQRCodePNG(text, { width: 320, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    return res.end(buffer);
  }

  if (QR && typeof QR.qrPngBuffer === 'function') {
    const buffer = await QR.qrPngBuffer(text, { width: 320, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    return res.end(buffer);
  }

  // Fallback: không có lib QR thì trả JSON
  return R.ok(res, { text }, 'QR service not available');
});

// (Tuỳ chọn) DELETE /bills/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;
  const doc = await Bill.findById(id);
  if (!doc) return R.fail(res, 404, 'Bill not found');

  // Chính sách: nếu đã paid → không cho xoá
  if (doc.paid) return R.fail(res, 409, 'Không thể xoá hoá đơn đã thanh toán');

  await Bill.findByIdAndDelete(id);
  return R.noContent(res);
});
