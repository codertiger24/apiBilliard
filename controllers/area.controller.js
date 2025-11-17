// controllers/area.controller.js
const Area = require('../models/area.model');
const Table = require('../models/table.model');
const { ok, created } = require('../utils/response');
const { asyncHandler } = require('../utils/response');

// Helper: parse query -> filter/sort/paging
function buildFilter(query) {
  const { q, active } = query || {};
  const filter = {};
  if (typeof active !== 'undefined') {
    // chấp nhận active=true/false hoặc 'true'/'false'
    filter.active = (active === true || active === 'true');
  }
  if (q && String(q).trim()) {
    const regex = new RegExp(String(q).trim(), 'i');
    filter.$or = [{ name: regex }, { code: regex }];
  }
  return filter;
}

function parsePaging(query) {
  const page = Math.max(parseInt(query?.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query?.limit || '50', 10), 1), 200);
  const sort = query?.sort || 'orderIndex';
  return { page, limit, sort };
}

/**
 * GET /areas
 * List khu vực (phân trang, lọc, sắp xếp)
 */
exports.list = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const { page, limit, sort } = parsePaging(req.query);

  const [items, total] = await Promise.all([
    Area.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    Area.countDocuments(filter),
  ]);

  return ok(res, {
    data: items,
    paging: { page, limit, total },
  });
});

/**
 * GET /areas/:id
 * Lấy chi tiết 1 khu vực
 */
exports.getOne = asyncHandler(async (req, res) => {
  const area = await Area.findById(req.params.id);
  if (!area) return res.status(404).json({ message: 'Area not found' });
  return ok(res, { area });
});

/**
 * POST /areas
 * Tạo khu vực
 */
exports.create = asyncHandler(async (req, res) => {
  const payload = {
    name: req.body.name,
    code: req.body.code,
    color: req.body.color,
    orderIndex: req.body.orderIndex ?? 0,
    active: req.body.active ?? true,
  };
  const area = await Area.create(payload);
  return created(res, { area });
});

/**
 * PUT /areas/:id
 * Cập nhật khu vực
 */
exports.update = asyncHandler(async (req, res) => {
  const payload = {
    name: req.body.name,
    code: req.body.code,
    color: req.body.color,
    orderIndex: req.body.orderIndex,
    active: req.body.active,
  };

  const area = await Area.findByIdAndUpdate(
    req.params.id,
    payload,
    { new: true, runValidators: true }
  );
  if (!area) return res.status(404).json({ message: 'Area not found' });
  return ok(res, { area });
});

/**
 * PATCH /areas/:id/active
 * Bật/tắt hoạt động
 */
exports.setActive = asyncHandler(async (req, res) => {
  const { active } = req.body;
  const area = await Area.findByIdAndUpdate(
    req.params.id,
    { active },
    { new: true, runValidators: true }
  );
  if (!area) return res.status(404).json({ message: 'Area not found' });
  return ok(res, { area });
});

/**
 * PATCH /areas/reorder
 * Cập nhật nhanh thứ tự hiển thị nhiều khu vực
 * body: { items: [{ id, orderIndex }, ...] }
 */
exports.reorder = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return ok(res, { ok: true, updated: 0 });

  const ops = items.map((it) => ({
    updateOne: {
      filter: { _id: it.id },
      update: { $set: { orderIndex: it.orderIndex ?? 0 } },
    },
  }));

  const result = await Area.bulkWrite(ops, { ordered: false });
  return ok(res, { ok: true, updated: result.modifiedCount || 0 });
});

/**
 * DELETE /areas/:id
 * Xoá khu vực – chặn xoá nếu còn bàn thuộc khu vực
 */
exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const tableCount = await Table.countDocuments({ areaId: id });
  if (tableCount > 0) {
    return res.status(400).json({
      message: 'Không thể xoá: còn bàn thuộc khu vực này.',
      tables: tableCount,
    });
  }

  const area = await Area.findByIdAndDelete(id);
  if (!area) return res.status(404).json({ message: 'Area not found' });
  return ok(res, { ok: true });
});
