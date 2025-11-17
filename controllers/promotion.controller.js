// controllers/promotion.controller.js
const R = require('../utils/response');
const Promotion = require('../models/promotion.model');
const { inTimeRange, dayOfWeek, toHHMM } = require('../utils/time');

/* ===================== Helpers ===================== */

function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function parseSort(sortStr = 'applyOrder') {
  if (!sortStr || typeof sortStr !== 'string') return { applyOrder: 1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function truthyBool(v) {
  return String(v) === 'true' || v === true;
}

function buildQuery({ q, code, scope, active, branchId }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }, { code: rx }, { description: rx }];
  }
  if (code) query.code = normalizeCode(code);
  if (scope) query.scope = scope;
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = truthyBool(active);
  }
  if (branchId) query.branchId = branchId;
  return query;
}

/** Kiểm tra khuyến mãi có hiệu lực tại thời điểm at (Date).
 *  - Nếu scope !== 'time' chỉ cần active = true là đủ (điều kiện khác xử lý ở service áp dụng).
 *  - Với scope='time' xét: khoảng ngày (validFrom/validTo, inclusive), thứ trong tuần, và khung giờ (hỗ trợ qua đêm).
 */
function isEffectiveAt(promo, at = new Date()) {
  if (!promo?.active) return false;
  if (promo.scope !== 'time') return true;

  const rule = promo.timeRule || {};
  const now = new Date(at);

  if (rule.validFrom && now < new Date(rule.validFrom)) return false;
  if (rule.validTo) {
    const end = new Date(rule.validTo);
    end.setHours(23, 59, 59, 999); // inclusive đến hết ngày validTo
    if (now > end) return false;
  }

  const dow = dayOfWeek(now); // 0..6
  if (Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length && !rule.daysOfWeek.includes(dow)) {
    return false;
  }

  if (Array.isArray(rule.timeRanges) && rule.timeRanges.length) {
    const cur = toHHMM(now); // 'HH:mm'
    const ok = rule.timeRanges.some((tr) => inTimeRange(cur, tr.from, tr.to));
    return ok;
  }

  return true;
}

/** Check discount input (ví dụ percent không vượt 100) */
function checkDiscount(discount) {
  if (!discount) return null;
  if (discount.type === 'percent') {
    const v = Number(discount.value || 0);
    if (v < 0 || v > 100) return 'Phần trăm giảm giá phải trong khoảng 0..100';
  }
  if (discount.value != null && Number(discount.value) < 0) {
    return 'Giá trị giảm không hợp lệ';
  }
  return null;
}

function isDupKey(err) {
  return err && (err.code === 11000 || /E11000/i.test(err.message || ''));
}

/* ===================== Controllers ===================== */

// GET /promotions
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    code,
    scope,
    active,
    at,          // ISO date string để lọc hiệu lực tại thời điểm
    branchId,
    sort = 'applyOrder',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const query = buildQuery({ q, code, scope, active, branchId });
  const sortObj = parseSort(String(sort));

  // Lấy theo query cơ bản, sau đó lọc theo "at" trong bộ nhớ
  let all = await Promotion.find(query).sort(sortObj).lean();

  if (at) {
    const atDate = new Date(at);
    all = all.filter((p) => isEffectiveAt(p, atDate));
  }

  const total = all.length;
  const start = (pageNum - 1) * limitNum;
  const items = all.slice(start, start + limitNum);

  return R.paged(res, { items, page: pageNum, limit: limitNum, total, sort });
});

// GET /promotions/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const { id } = req.params;
  const at = req.query?.at ? new Date(req.query.at) : null;

  const doc = await Promotion.findById(id);
  if (!doc) return R.fail(res, 404, 'Promotion not found');

  const data = sanitize(doc);
  if (at) data.activeAt = isEffectiveAt(data, at);

  return R.ok(res, data);
});

// POST /promotions
exports.create = R.asyncHandler(async (req, res) => {
  const payload = {
    name: req.body.name,
    code: normalizeCode(req.body.code),
    scope: req.body.scope,

    active: req.body.active ?? true,
    applyOrder: Number(req.body.applyOrder ?? 100),
    stackable: req.body.stackable ?? true,

    timeRule: req.body.timeRule || undefined,
    productRule: req.body.productRule || undefined,
    billRule: req.body.billRule || undefined,

    discount: req.body.discount,
    description: req.body.description || '',
    branchId: req.body.branchId || null,
  };

  const errMsg = checkDiscount(payload.discount);
  if (errMsg) return R.fail(res, 422, errMsg);

  try {
    const doc = await Promotion.create(payload);
    return R.created(res, sanitize(doc), 'Promotion created');
  } catch (err) {
    if (isDupKey(err)) {
      return R.fail(res, 409, 'Mã khuyến mãi đã tồn tại trong chi nhánh này');
    }
    throw err;
  }
});

// PUT /promotions/:id
exports.update = R.asyncHandler(async (req, res) => {
  const doc = await Promotion.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Promotion not found');

  const {
    name,
    code,
    scope,
    active,
    applyOrder,
    stackable,
    timeRule,
    productRule,
    billRule,
    discount,
    description,
    branchId,
  } = req.body;

  if (typeof name !== 'undefined') doc.name = name;
  if (typeof code !== 'undefined') doc.code = normalizeCode(code);
  if (typeof scope !== 'undefined') doc.scope = scope;

  if (typeof active !== 'undefined') doc.active = !!active;
  if (typeof applyOrder !== 'undefined') doc.applyOrder = Number(applyOrder);
  if (typeof stackable !== 'undefined') doc.stackable = !!stackable;

  if (typeof timeRule !== 'undefined') doc.timeRule = timeRule;
  if (typeof productRule !== 'undefined') doc.productRule = productRule;
  if (typeof billRule !== 'undefined') doc.billRule = billRule;

  if (typeof discount !== 'undefined') {
    const errMsg = checkDiscount(discount);
    if (errMsg) return R.fail(res, 422, errMsg);
    doc.discount = discount;
  }

  if (typeof description !== 'undefined') doc.description = description;
  if (typeof branchId !== 'undefined') doc.branchId = branchId;

  try {
    await doc.save();
  } catch (err) {
    if (isDupKey(err)) {
      return R.fail(res, 409, 'Mã khuyến mãi đã tồn tại trong chi nhánh này');
    }
    throw err;
  }
  return R.ok(res, sanitize(doc), 'Promotion updated');
});

// PATCH /promotions/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const doc = await Promotion.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Promotion not found');

  doc.active = !!req.body.active;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Active state updated');
});

// PATCH /promotions/:id/apply-order
exports.setApplyOrder = R.asyncHandler(async (req, res) => {
  const doc = await Promotion.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Promotion not found');

  const val = Number(req.body.applyOrder);
  doc.applyOrder = Number.isFinite(val) && val >= 0 ? val : 0;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Apply order updated');
});

// DELETE /promotions/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;
  const doc = await Promotion.findByIdAndDelete(id);
  if (!doc) return R.fail(res, 404, 'Promotion not found');
  return R.noContent(res);
});
