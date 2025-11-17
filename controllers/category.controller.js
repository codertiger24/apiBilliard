// controllers/category.controller.js
const R = require('../utils/response');
const Category = require('../models/product-category.model');
const Product = require('../models/product.model');

/* =============== Helpers =============== */
function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function parseSort(sortStr = 'orderIndex') {
  if (!sortStr || typeof sortStr !== 'string') return { orderIndex: 1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, active, branchId }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }, { code: rx }, { description: rx }];
  }
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = String(active) === 'true' || active === true;
  }
  if (branchId) query.branchId = branchId;
  return query;
}

/* =============== Controllers =============== */

// GET /categories
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    active,
    branchId,
    sort = 'orderIndex',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({ q, active, branchId });
  const sortObj = parseSort(String(sort));

  const [items, total] = await Promise.all([
    Category.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
    Category.countDocuments(query),
  ]);

  return R.paged(res, {
    items,
    page: pageNum,
    limit: limitNum,
    total,
    sort,
  });
});

// GET /categories/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const doc = await Category.findById(req.params.id).lean();
  if (!doc) return R.fail(res, 404, 'Category not found');

  const productsUsing = await Product.countDocuments({ category: doc._id });
  return R.ok(res, { ...doc, productsUsing });
});

// POST /categories
exports.create = R.asyncHandler(async (req, res) => {
  const {
    name,
    code,
    description = '',
    icon = '',
    color = '',
    orderIndex,
    active = true,
    branchId = null,
  } = req.body;

  // Nếu không gửi orderIndex -> set theo số lượng hiện có để đẩy xuống cuối
  let oi = orderIndex;
  if (typeof oi === 'undefined' || oi === null) {
    const count = await Category.countDocuments({ branchId: branchId || null });
    oi = count;
  }

  const payload = {
    name: String(name || '').trim(),
    code: String(code || '').trim().toUpperCase(),
    description,
    icon,
    color,
    orderIndex: Number(oi) || 0,
    active: !!active,
    branchId: branchId || null,
  };

  // Chặn trùng (branchId, code) / (branchId, name) sớm để báo lỗi đẹp
  const dup = await Category.findOne({
    branchId: payload.branchId,
    $or: [{ code: payload.code }, { name: payload.name }],
  })
    .select('_id code name')
    .lean();

  if (dup) {
    return R.fail(res, 409, 'Category code/name already exists in this branch');
  }

  const doc = await Category.create(payload);
  return R.created(res, sanitize(doc), 'Category created');
});

// PUT /categories/:id
exports.update = R.asyncHandler(async (req, res) => {
  const {
    name,
    code,
    description,
    icon,
    color,
    orderIndex,
    active,
    branchId,
  } = req.body;

  const doc = await Category.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Category not found');

  if (typeof name !== 'undefined') doc.name = String(name || '').trim();
  if (typeof code !== 'undefined') doc.code = String(code || '').trim().toUpperCase();
  if (typeof description !== 'undefined') doc.description = description ?? '';
  if (typeof icon !== 'undefined') doc.icon = icon ?? '';
  if (typeof color !== 'undefined') doc.color = color ?? '';
  if (typeof orderIndex !== 'undefined') doc.orderIndex = Number(orderIndex) || 0;
  if (typeof active !== 'undefined') doc.active = !!active;
  if (typeof branchId !== 'undefined') doc.branchId = branchId || null;

  // Kiểm tra trùng (branchId, code/name) khi có thay đổi
  if (doc.isModified('code') || doc.isModified('name') || doc.isModified('branchId')) {
    const exists = await Category.findOne({
      _id: { $ne: doc._id },
      branchId: doc.branchId,
      $or: [{ code: doc.code }, { name: doc.name }],
    })
      .select('_id')
      .lean();
    if (exists) return R.fail(res, 409, 'Category code/name already exists in this branch');
  }

  await doc.save();
  return R.ok(res, sanitize(doc), 'Category updated');
});

// PATCH /categories/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const doc = await Category.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Category not found');

  doc.active = !!req.body.active;
  await doc.save();
  return R.ok(res, sanitize(doc), 'Active state updated');
});

// DELETE /categories/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;

  // Chặn xoá nếu còn sản phẩm tham chiếu
  const used = await Product.exists({ category: id });
  if (used) return R.fail(res, 409, 'Không thể xoá: danh mục đang có sản phẩm');

  const doc = await Category.findByIdAndDelete(id);
  if (!doc) return R.fail(res, 404, 'Category not found');

  return R.noContent(res);
});
