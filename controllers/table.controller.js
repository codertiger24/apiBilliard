// controllers/table.controller.js
const R = require('../utils/response');
const Table = require('../models/table.model');
const Session = require('../models/session.model');
const Bill = require('../models/bill.model');

/** -------------------- helpers -------------------- */
function parseSort(sortStr = 'orderIndex') {
  if (!sortStr || typeof sortStr !== 'string') return { orderIndex: 1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, status, areaId, active }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }];
  }
  if (status) query.status = status;
  if (areaId) query.areaId = areaId;
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = String(active) === 'true' || active === true;
  }
  return query;
}

function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

/** Gắn thông tin phiên đang chơi (nếu có) vào danh sách bàn */
async function attachOpenSessionInfo(tables) {
  if (!tables || !tables.length) return tables;
  const ids = tables.map((t) => t._id);
  const sessions = await Session.find({
  table: { $in: ids },
  status: 'open',
})
  .select('_id table startTime items')
  .populate('items.product', 'name price images')
  .lean();


  const map = new Map();
  sessions.forEach((s) => map.set(String(s.table), s));
  return tables.map((t) => {
    const s = map.get(String(t._id));
    if (!s) return t;
    return {
      ...t,
      currentSession: {
        id: s._id,
        startTime: s.startTime,
        itemsCount: Array.isArray(s.items) ? s.items.length : 0,
      },
    };
  });
}

/** -------------------- controllers -------------------- */

// GET /tables
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    status,
    areaId,
    active,
    sort = 'orderIndex',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({ q, status, areaId, active });
  const sortObj = parseSort(String(sort));

  const [itemsRaw, total] = await Promise.all([
    Table.find(query)
      .populate('areaId', 'name code') // có thể null
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Table.countDocuments(query),
  ]);

  // Gắn thông tin phiên mở vào từng bàn
  const items = await attachOpenSessionInfo(itemsRaw);

  return R.paged(res, {
    items: items.map(sanitize),
    page: pageNum,
    limit: limitNum,
    total,
    sort,
  });
});

// GET /tables/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const id = req.params.id;
  const table = await Table.findById(id).populate('areaId', 'name code').lean();
  if (!table) return R.fail(res, 404, 'Table not found');

const sess = await Session.findOne({ table: id, status: 'open' })
  .select('_id startTime items')
  .populate('items.product', 'name price images')  // lấy images
  .lean();

const items = (sess?.items || []).map(it => ({
  _id: it._id,
  product: it.product
    ? {
        _id: it.product._id,
        name: it.product.name,
        price: it.product.price,
        images: it.product.images || [],
      }
    : null,
  nameSnapshot: it.nameSnapshot,
  priceSnapshot: it.priceSnapshot,
  imageSnapshot: it.imageSnapshot || (it.product?.images?.[0] || null),
  qty: it.qty,
  note: it.note || '',
}));

const data = sanitize({
  ...table,
  currentSession: sess ? { id: sess._id, startTime: sess.startTime, items } : null,
});



  return R.ok(res, data);
});

// POST /tables
exports.create = R.asyncHandler(async (req, res) => {
  const {
    name,
    areaId = null,     // có thể chưa gán khu vực
    ratePerHour,       // bắt buộc vì không còn TableType
    orderIndex = 0,
    active = true,
  } = req.body;

  // nếu không truyền orderIndex → đặt theo số lượng hiện có (trong cùng khu vực nếu muốn)
  let oi = orderIndex;
  if (typeof oi === 'undefined' || oi === null) {
    const count = await Table.countDocuments({ areaId: areaId || null });
    oi = count;
  }

  const doc = await Table.create({
    name: String(name).trim(),
    areaId: areaId || null,
    ratePerHour: Number(ratePerHour),
    orderIndex: oi,
    active: !!active,
  });

  return R.created(res, sanitize(doc), 'Table created');
});

// PUT /tables/:id
exports.update = R.asyncHandler(async (req, res) => {
  const { name, areaId, ratePerHour, orderIndex, active } = req.body;

  const table = await Table.findById(req.params.id);
  if (!table) return R.fail(res, 404, 'Table not found');

  if (typeof name !== 'undefined') table.name = name;
  if (typeof areaId !== 'undefined') table.areaId = areaId || null;
  if (typeof ratePerHour !== 'undefined') table.ratePerHour = Number(ratePerHour);
  if (typeof orderIndex !== 'undefined') table.orderIndex = Number(orderIndex) || 0;
  if (typeof active !== 'undefined') table.active = !!active;

  await table.save();
  return R.ok(res, sanitize(table), 'Table updated');
});

// PATCH /tables/:id/status
exports.changeStatus = R.asyncHandler(async (req, res) => {
  const { status } = req.body; // 'available' | 'playing' | 'reserved' | 'maintenance'
  const table = await Table.findById(req.params.id);
  if (!table) return R.fail(res, 404, 'Table not found');

  // Không cho set 'playing' thủ công nếu đã có phiên mở
  if (status === 'playing') {
    const opened = await Session.exists({ table: table._id, status: 'open' });
    if (!opened) {
      // Cho phép chuyển playing (ví dụ đồng bộ trạng thái), nhưng khuyến nghị dùng /sessions (check-in)
      table.status = 'playing';
    } else {
      table.status = 'playing';
    }
  } else {
    table.status = status;
  }

  await table.save();
  return R.ok(res, sanitize(table), 'Status updated');
});

// PATCH /tables/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return R.fail(res, 404, 'Table not found');

  table.active = !!req.body.active;
  await table.save();
  return R.ok(res, sanitize(table), 'Active state updated');
});

// PATCH /tables/:id/rate
exports.setRate = R.asyncHandler(async (req, res) => {
  const { ratePerHour } = req.body; // number
  const table = await Table.findById(req.params.id);
  if (!table) return R.fail(res, 404, 'Table not found');

  table.ratePerHour = Number(ratePerHour);
  await table.save();
  return R.ok(res, sanitize(table), 'Rate updated');
});

// PATCH /tables/reorder
exports.reorder = R.asyncHandler(async (req, res) => {
  const { items } = req.body; // [{id, orderIndex}]
  if (!Array.isArray(items) || !items.length) {
    return R.fail(res, 400, 'items is required');
  }

  const ops = items.map((it) => ({
    updateOne: {
      filter: { _id: it.id },
      update: { $set: { orderIndex: Number(it.orderIndex) || 0 } },
    },
  }));

  const result = await Table.bulkWrite(ops, { ordered: false });
  return R.ok(res, { matched: result.matchedCount, modified: result.modifiedCount }, 'Reordered');
});

// DELETE /tables/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;

  // chặn nếu còn phiên mở
  const open = await Session.exists({ table: id, status: 'open' });
  if (open) return R.fail(res, 409, 'Không thể xoá: Bàn đang có phiên mở');

  // chặn nếu có bill đã lưu (lịch sử)
  const used = await Bill.exists({ table: id });
  if (used) return R.fail(res, 409, 'Không thể xoá: Bàn đã có hóa đơn lịch sử');

  const doc = await Table.findByIdAndDelete(id);
  if (!doc) return R.fail(res, 404, 'Table not found');

  return R.noContent(res);
});
