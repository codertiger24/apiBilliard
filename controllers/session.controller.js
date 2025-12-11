// controllers/session.controller.js
const R = require('../utils/response');
const Session = require('../models/session.model');
const Table = require('../models/table.model');
const Product = require('../models/product.model');
const Bill = require('../models/bill.model');

function safeRequire(p) { try { return require(p); } catch { return null; } }
const Billing = safeRequire('../services/billing.service'); // optional service
const { getActiveSetting } = Billing || {};
const { applyGraceAndRound, diffMinutes } = require('../utils/time');
const { ensureUniqueCode, makeBillCode } = require('../utils/codegen');

/* ===================== Helpers ===================== */

function getSessionId(req) {
  // Tương thích :id | :sessionId | body/query
  return (
    req?.params?.id ||
    req?.params?.sessionId ||
    req?.body?.sessionId ||
    req?.query?.sessionId ||
    null
  );
}

function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function parseSort(sortStr = '-startTime') {
  if (!sortStr || typeof sortStr !== 'string') return { startTime: -1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, status, table, staffStart, staffEnd, areaId, from, to }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ note: rx }];
  }
  if (status) query.status = status;
  if (table) query.table = table;
  if (staffStart) query.staffStart = staffStart;
  if (staffEnd) query.staffEnd = staffEnd;
  if (areaId) query.areaId = areaId;
  if (from || to) {
    query.startTime = {};
    if (from) query.startTime.$gte = new Date(from);
    if (to) query.startTime.$lte = new Date(to);
  }
  return query;
}

/** Fallback tính tạm nếu không có billing.service */
async function fallbackPreview(
  session,
  { endAt = new Date(), setting = null, discountLines = [], surcharge = 0 } = {}
) {
  const start = session.startTime;
  const end = endAt ? new Date(endAt) : new Date();

  const minsRaw = diffMinutes(start, end);
  const rate = Number(session.pricingSnapshot?.ratePerHour || 0);
  const roundCfg = {
    roundingStep: setting?.billing?.roundingStep ?? 5,
    roundingMode: setting?.billing?.roundingMode ?? 'ceil',
    graceMinutes: setting?.billing?.graceMinutes ?? 0,
  };
  const mins = applyGraceAndRound(minsRaw, roundCfg);
  const playAmount = Math.round(((mins * rate) / 60) * 100) / 100;

  let serviceAmount = 0;
  if (Array.isArray(session.items)) {
    for (const it of session.items) {
      const qty = Number(it.qty || 0);
      const price = Number(it.priceSnapshot || 0);
      serviceAmount += qty * price;
    }
  }

  let discountTotal = 0;
  for (const d of discountLines || []) {
    if (!d) continue;
    const val = Number(d.value || 0);
    if (d.type === 'percent') {
      const base = playAmount + serviceAmount;
      const capped = d.maxAmount != null ? Number(d.maxAmount) : base;
      discountTotal += Math.min(base * (val / 100), capped);
    } else if (d.type === 'value') {
      discountTotal += val;
    }
  }

  const subtotal = playAmount + serviceAmount;
  const total = Math.max(
    0,
    Math.round((subtotal - discountTotal + Number(surcharge || 0)) * 100) / 100
  );

  return {
    startTime: session.startTime,
    endTime: end,
    minutes: mins,
    ratePerHour: rate,
    playAmount,
    serviceAmount,
    discountTotal,
    surcharge: Number(surcharge || 0),
    subtotal,
    total,
  };
}

/* ===================== Controllers ===================== */

// GET /sessions
exports.list = R.asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sort, ...filter } = req.query;
  const query = buildQuery(filter);
  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Session.find(query)
      .sort(parseSort(sort))
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Session.countDocuments(query),
  ]);

  return R.paged(res, {
    items,
    page: Number(page),
    limit: Number(limit),
    total,
  });
});

// GET /sessions/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');

  return R.ok(res, sanitize(sess));
});

// POST /sessions  (check-in)
exports.open = R.asyncHandler(async (req, res) => {
  const { tableId, startAt, note } = req.body;

  // 1) Nếu có billing service đầy đủ thì dùng luôn để đảm bảo snapshot chuẩn
  if (Billing && typeof Billing.openSession === 'function') {
    const sess = await Billing.openSession({
      tableId,
      staffId: req.user?._id || null,
      startAt: startAt ? new Date(startAt) : new Date(),
      note,
    });
    return R.created(res, sanitize(sess), 'Session opened');
  }

  // 2) Fallback: tự tạo session thủ công
  const table = await Table.findById(tableId).lean();
  if (!table || !table.active) return R.fail(res, 400, 'Table not available');

  // Không cho mở nếu đã có session open
  const exists = await Session.exists({ table: table._id, status: 'open' });
  if (exists) return R.fail(res, 409, 'Bàn đang có phiên mở');

  // Lấy setting để snapshot rule (global)
  let setting = null;
  if (typeof getActiveSetting === 'function') {
    setting = await getActiveSetting();
  }

  const at = startAt ? new Date(startAt) : new Date();

  // Snapshot giá từ chính Table (đã bỏ TableType)
  const pricingSnapshot = {
    ratePerHour: Number(table.ratePerHour || 0),
    rateSource: 'table',
  };

  const billingRuleSnapshot = {
    roundingStep: Number(setting?.billing?.roundingStep ?? 5),
    graceMinutes: Number(setting?.billing?.graceMinutes ?? 0),
  };

  const sess = await Session.create({
    table: table._id,
    areaId: table.areaId || null,
    billingRuleSnapshot,
    pricingSnapshot,
    startTime: at,
    status: 'open',
    items: [],
    staffStart: req.user?._id || null,
    note: note || '',
  });

  // cập nhật trạng thái bàn
  await Table.findByIdAndUpdate(table._id, { $set: { status: 'playing' } });

  return R.created(res, sanitize(sess), 'Session opened');
});

// POST /sessions/:id/items
exports.addItem = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');

  const { productId, qty, note } = req.body;

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');
  if (sess.status !== 'open') return R.fail(res, 409, 'Session already closed/void');

 const prod = await Product.findById(productId).select('name price unit active images');
if (!prod || prod.active === false) return R.fail(res, 400, 'Product not available');

const imageSnapshot = Array.isArray(prod.images) && prod.images.length ? prod.images[0] : null;

const exist = sess.items.find((i) => String(i.product) === String(prod._id));
if (exist) {
  exist.qty = Number(exist.qty || 0) + Number(qty || 0);
  if (typeof note !== 'undefined') exist.note = note;
  // nếu chưa có imageSnapshot trên item và prod có ảnh, cập nhật (tùy chọn)
  if (!exist.imageSnapshot && imageSnapshot) exist.imageSnapshot = imageSnapshot;
} else {
  sess.items.push({
    product: prod._id,
    nameSnapshot: prod.name,
    priceSnapshot: prod.price,
    qty: Number(qty || 1),
    note: note || '',
    imageSnapshot, // <-- lưu snapshot ảnh
  });
}


  await sess.save();

  return R.ok(res, sanitize(sess), 'Item added');
});

// PATCH /sessions/:id/items/:itemId
exports.updateItemQty = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');
  const { itemId } = req.params;
  const { qty, note } = req.body;

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');
  if (sess.status !== 'open') return R.fail(res, 409, 'Session already closed/void');

  const item = sess.items.id(itemId);
  if (!item) return R.fail(res, 404, 'Item not found');

  if (Number(qty) <= 0) {
    item.deleteOne();
  } else {
    item.qty = Number(qty);
    if (typeof note !== 'undefined') item.note = note;
  }

  await sess.save();

  return R.ok(res, sanitize(sess), 'Item updated');
});

// DELETE /sessions/:id/items/:itemId
exports.removeItem = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');
  const { itemId } = req.params;

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');
  if (sess.status !== 'open') return R.fail(res, 409, 'Session already closed/void');

  const item = sess.items.id(itemId);
  if (!item) return R.fail(res, 404, 'Item not found');

  item.deleteOne();
  await sess.save();

  return R.ok(res, sanitize(sess), 'Item removed');
});

// GET /sessions/:id/preview-close
exports.previewClose = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');

  const endAt = req.query?.endAt ? new Date(req.query.endAt) : new Date();

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');
  if (sess.status !== 'open') return R.fail(res, 409, 'Session already closed/void');

  let setting = null;
  if (typeof getActiveSetting === 'function') {
    setting = await getActiveSetting();
  }

  // Nếu service có hàm previewClose thì ưu tiên dùng
  if (Billing && typeof Billing.previewClose === 'function') {
    const result = await Billing.previewClose({ sessionId: sess._id, endAt, setting });
    return R.ok(res, result);
  }

  const result = await fallbackPreview(sess, { endAt, setting });
  return R.ok(res, result);
});

// POST /sessions/:id/checkout
exports.checkout = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');

  const {
    endAt,
    discountLines = [],
    surcharge = 0,
    paymentMethod = 'cash',
    paid = false,
    note,
  } = req.body;

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');
  if (sess.status !== 'open') return R.fail(res, 409, 'Session already closed/void');

  if (typeof note !== 'undefined') sess.note = note;

  let setting = null;
  if (typeof getActiveSetting === 'function') {
    setting = await getActiveSetting();
  }

  // Ưu tiên dùng service (có transaction)
  if (Billing && typeof Billing.checkoutSession === 'function') {
    const { bill, session: updated } = await Billing.checkoutSession({
      sessionId: sess._id,
      endAt,
      discountLines,
      surcharge,
      paymentMethod,
      paid,
      staffId: req.user?._id || null,
      note,
    });

    return R.ok(
      res,
      {
        session: sanitize(updated),
        bill: sanitize(bill),
      },
      'Session closed & bill created'
    );
  }

  // Fallback (không transaction)
  const preview = await fallbackPreview(sess, { endAt, setting, discountLines, surcharge });
  const code = await ensureUniqueCode(Bill, { field: 'code', gen: makeBillCode });

  const table = await Table.findById(sess.table).lean();

  const billDoc = await Bill.create({
    code,
    session: sess._id,
    table: sess.table,
    tableName: table?.name || '',
    staff: req.user?._id || sess.staffStart || null,
    items: [
      {
        type: 'play',
        minutes: preview.minutes,
        ratePerHour: preview.ratePerHour,
        amount: preview.playAmount,
      },
      ...(sess.items || []).map((it) => ({
        type: 'product',
        productId: it.product || null,
        nameSnapshot: it.nameSnapshot,
        priceSnapshot: it.priceSnapshot,
        qty: it.qty,
        amount: it.priceSnapshot * it.qty,
        note: it.note || '',
      })),
    ],
    discounts: discountLines,
    surcharge,
    playAmount: preview.playAmount,
    serviceAmount: preview.serviceAmount,
    subTotal: preview.subtotal,
    total: preview.total,
    paid: !!paid,
    paidAt: paid ? new Date() : null,
    paymentMethod,
    note: note || sess.note || '',
  });

  // Cập nhật session
  sess.status = 'closed';
  sess.endTime = preview.endTime;
  sess.durationMinutes = preview.minutes;
  sess.staffEnd = req.user?._id || null;
  await sess.save();

  // Trả bàn về available
  if (table?._id) {
    await Table.findByIdAndUpdate(table._id, { $set: { status: 'available' } });
  }

  return R.ok(
    res,
    {
      session: sanitize(sess),
      bill: sanitize(billDoc),
    },
    'Session closed & bill created'
  );
});

// PATCH /sessions/:id/void
exports.void = R.asyncHandler(async (req, res) => {
  const id = getSessionId(req);
  if (!id) return R.fail(res, 400, 'Missing session id');
  const { reason } = req.body;

  const sess = await Session.findById(id);
  if (!sess) return R.fail(res, 404, 'Session not found');
  if (sess.status !== 'open') return R.fail(res, 409, 'Session already closed/void');

  sess.status = 'void';
  sess.endTime = new Date();
  sess.staffEnd = req.user?._id || null;
  sess.voidReason = reason || 'void';
  await sess.save();

  // Trả bàn về available
  await Table.findByIdAndUpdate(sess.table, { $set: { status: 'available' } });

  return R.ok(res, sanitize(sess), 'Session voided');
});
