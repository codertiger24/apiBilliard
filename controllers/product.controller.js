// controllers/product.controller.js
const R = require('../utils/response');
const Product = require('../models/product.model');
const Category = require('../models/product-category.model');
const Session = require('../models/session.model');
const Bill = require('../models/bill.model');
const { makeSkuFromName } = require('../utils/codegen');

/* ===================== Helpers ===================== */

function parseSort(sortStr = 'name') {
  if (!sortStr || typeof sortStr !== 'string') return { name: 1 };
  const desc = sortStr.startsWith('-');
  const field = desc ? sortStr.slice(1) : sortStr;
  return { [field]: desc ? -1 : 1 };
}

function buildQuery({ q, category, tag, active, isService, branchId, minPrice, maxPrice }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/\s+/g, '.*'), 'i');
    query.$or = [{ name: rx }, { sku: rx }, { tags: rx }];
  }
  if (category) query.category = category;
  if (tag) query.tags = { $in: [String(tag)] };
  if (typeof active === 'boolean' || active === 'true' || active === 'false') {
    query.active = String(active) === 'true' || active === true;
  }
  if (typeof isService === 'boolean' || isService === 'true' || isService === 'false') {
    query.isService = String(isService) === 'true' || isService === true;
  }
  if (branchId) query.branchId = branchId;
  if (typeof minPrice !== 'undefined' || typeof maxPrice !== 'undefined') {
    query.price = {};
    if (typeof minPrice !== 'undefined') query.price.$gte = Number(minPrice);
    if (typeof maxPrice !== 'undefined') query.price.$lte = Number(maxPrice);
  }
  return query;
}

function normalizeSKU(v) {
  const s = (v ?? '').toString().trim().toUpperCase();
  return s || null;
}

/* ===================== Controllers ===================== */

// GET /products
exports.list = R.asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    q,
    category,
    tag,
    active,
    isService,
    branchId,
    minPrice,
    maxPrice,
    sort = 'name',
  } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const query = buildQuery({ q, category, tag, active, isService, branchId, minPrice, maxPrice });
  const sortObj = parseSort(String(sort));

  const [items, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name code')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Product.countDocuments(query),
  ]);

  return R.paged(res, {
    items,
    page: pageNum,
    limit: limitNum,
    total,
    sort,
  });
});

// GET /products/:id
exports.getOne = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id)
    .populate('category', 'name code')
    .lean();
  if (!doc) return R.fail(res, 404, 'Product not found');
  return R.ok(res, doc);
});

// POST /products
exports.create = R.asyncHandler(async (req, res) => {
  const {
    name,
    sku,
    category,
    price,
    unit,
    isService = false,
    images = [],
    tags = [],
    active = true,
    branchId = null,
    note = '',
  } = req.body;

  // 1) Kiểm tra category tồn tại
  const cat = await Category.findById(category).select('_id').lean();
  if (!cat) return R.fail(res, 400, 'Category not found');

  // 2) SKU cuối cùng (tự tạo nếu thiếu)
  const finalSku = normalizeSKU(sku ?? makeSkuFromName(name));

  // 3) Chặn trùng SKU trong cùng chi nhánh (trùng index model)
  if (finalSku) {
    const dup = await Product.findOne({ branchId: branchId || null, sku: finalSku })
      .select('_id')
      .lean();
    if (dup) return R.fail(res, 409, 'SKU already exists in this branch');
  }

  const safeImages = Array.isArray(images)
    ? images.filter((s) => typeof s === 'string').slice(0, 10)
    : [];
  const safeTags = Array.isArray(tags)
    ? Array.from(new Set(tags.map((t) => String(t).trim()))).slice(0, 20)
    : [];

  const doc = await Product.create({
    name: String(name).trim(),
    sku: finalSku,
    category,
    price: Number(price || 0),
    unit: unit || '',
    isService: !!isService,
    images: safeImages,
    tags: safeTags,
    active: !!active,
    branchId: branchId || null,
    note: note || '',
  });

  // Trả về có populate danh mục để FE tiện hiển thị
  const created = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.created(res, created, 'Product created');
});

// PUT /products/:id
exports.update = R.asyncHandler(async (req, res) => {
  const {
    name,
    sku,
    category,
    price,
    unit,
    isService,
    images,
    tags,
    active,
    branchId,
    note,
  } = req.body;

  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  // Nếu đổi category -> check tồn tại
  if (typeof category !== 'undefined') {
    const cat = await Category.findById(category).select('_id').lean();
    if (!cat) return R.fail(res, 400, 'Category not found');
    doc.category = category;
  }

  if (typeof name !== 'undefined') doc.name = String(name).trim();

  if (typeof sku !== 'undefined') {
    const nextSku = normalizeSKU(sku);
    // Nếu thay SKU → kiểm tra trùng theo (branchId, sku)
    if (nextSku !== doc.sku) {
      if (nextSku) {
        const branchToCheck = typeof branchId !== 'undefined' ? (branchId || null) : (doc.branchId || null);
        const dup = await Product.findOne({
          _id: { $ne: doc._id },
          branchId: branchToCheck,
          sku: nextSku,
        })
          .select('_id')
          .lean();
        if (dup) return R.fail(res, 409, 'SKU already exists in this branch');
      }
      doc.sku = nextSku;
    }
  }

  if (typeof price !== 'undefined') doc.price = Number(price);
  if (typeof unit !== 'undefined') doc.unit = unit ?? '';
  if (typeof isService !== 'undefined') doc.isService = !!isService;

  if (typeof images !== 'undefined' && Array.isArray(images)) {
    doc.images = images.filter((s) => typeof s === 'string').slice(0, 10);
  }

  if (typeof tags !== 'undefined' && Array.isArray(tags)) {
    doc.tags = Array.from(new Set(tags.map((t) => String(t).trim()))).slice(0, 20);
  }

  if (typeof active !== 'undefined') doc.active = !!active;
  if (typeof branchId !== 'undefined') doc.branchId = branchId || null;
  if (typeof note !== 'undefined') doc.note = note ?? '';

  await doc.save();

  const updated = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.ok(res, updated, 'Product updated');
});

// PATCH /products/:id/active
exports.setActive = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  doc.active = !!req.body.active;
  await doc.save();

  const out = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.ok(res, out, 'Active state updated');
});

// PATCH /products/:id/price
exports.setPrice = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  doc.price = Number(req.body.price);
  await doc.save();

  const out = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.ok(res, out, 'Price updated');
});

// PATCH /products/:id/images
exports.setImages = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  const arr = Array.isArray(req.body.images)
    ? req.body.images.filter((s) => typeof s === 'string')
    : [];
  doc.images = arr.slice(0, 10);

  await doc.save();

  const out = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.ok(res, out, 'Images replaced');
});

// PATCH /products/:id/tags/add
exports.addTags = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  const incoming = Array.isArray(req.body.tags) ? req.body.tags : [];
  const next = new Set([...(doc.tags || []).map((t) => String(t).trim())]);
  for (const t of incoming) next.add(String(t).trim());
  doc.tags = Array.from(next).slice(0, 20);

  await doc.save();

  const out = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.ok(res, out, 'Tags added');
});

// PATCH /products/:id/tags/remove
exports.removeTags = R.asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  const toRemove = new Set(
    (Array.isArray(req.body.tags) ? req.body.tags : []).map((t) => String(t).trim())
  );
  doc.tags = (doc.tags || []).filter((t) => !toRemove.has(String(t).trim()));

  await doc.save();

  const out = await Product.findById(doc._id).populate('category', 'name code').lean();
  return R.ok(res, out, 'Tags removed');
});

// DELETE /products/:id
exports.remove = R.asyncHandler(async (req, res) => {
  const id = req.params.id;

  // 1) Chặn xoá nếu đang nằm trong phiên mở
  const usedInOpen = await Session.exists({ status: 'open', 'items.product': id });
  if (usedInOpen) return R.fail(res, 409, 'Không thể xoá: Sản phẩm đang nằm trong phiên mở');

  // 2) Chặn xoá nếu đã có lịch sử hoá đơn (Bill.items.productId)
  const usedInBills = await Bill.exists({ 'items.productId': id });
  if (usedInBills) return R.fail(res, 409, 'Không thể xoá: Sản phẩm đã có lịch sử hóa đơn');

  const doc = await Product.findByIdAndDelete(id);
  if (!doc) return R.fail(res, 404, 'Product not found');

  return R.noContent(res);
});
