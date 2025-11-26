// validators/session.schema.js
const Joi = require('joi');

// ---------- Helpers ----------
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const SESSION_STATUS = ['open', 'closed', 'void'];
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

const discountLine = Joi.object({
  name: Joi.string().trim().max(160).default('Discount'),
  type: Joi.string().valid('percent', 'value').required(),
  value: Joi.number().min(0).required(),          // percent: 0..100, value: VND
  amount: Joi.number().min(0).optional(),         // nếu không gửi → service tự tính
  meta: Joi.any().optional(),
});

// ---------- Schemas ----------

// GET /sessions  (list + filter)
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(20),

    q: Joi.string().trim().allow('', null),                 // tìm theo note, tableName (nếu có)
    status: Joi.string().valid(...SESSION_STATUS).optional(),
    table: objectId().optional(),
    staffStart: objectId().optional(),
    staffEnd: objectId().optional(),
    areaId: objectId().allow(null, ''),                     // lọc theo khu vực (snapshot)

    from: Joi.date().iso().optional(),                      // lọc theo startTime
    to: Joi.date().iso().optional(),

    // sort: 'startTime' | '-startTime' | 'createdAt' | '-createdAt'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(startTime|createdAt)$/)
      .default('-startTime'),
  }),
};

// POST /sessions  (check-in / open session)
module.exports.open = {
  body: Joi.object({
    tableId: objectId().required(),
    startAt: Joi.date().iso().optional(),                   // mặc định now
    note: Joi.string().trim().max(300).allow('', null).optional(),
  }),
};

// POST /sessions/:id/items  (thêm sản phẩm vào phiên)
module.exports.addItem = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    productId: objectId().required(),
    qty: Joi.number().integer().min(1).required(),
    note: Joi.string().trim().max(200).allow('', null).optional(),
  }),
};

// PATCH /sessions/:id/items/:itemId  (cập nhật số lượng 1 item)
// Lưu ý: qty = 0 có thể hiểu là xóa item (tuỳ controller quyết định)
module.exports.updateItemQty = {
  params: Joi.object({
    id: objectId().required(),
    itemId: objectId().required(),
  }),
  body: Joi.object({
    qty: Joi.number().integer().min(0).required(),
    note: Joi.string().trim().max(200).allow('', null).optional(),
  }),
};

// DELETE /sessions/:id/items/:itemId  (xóa item)
module.exports.removeItem = {
  params: Joi.object({
    id: objectId().required(),
    itemId: objectId().required(),
  }),
};

// GET /sessions/:id/preview-close?endAt=ISO  (xem tạm tính)
module.exports.previewClose = {
  params: Joi.object({ id: objectId().required() }),
  query: Joi.object({
    endAt: Joi.date().iso().optional(),                      // mặc định now
  }),
};

// POST /sessions/:id/checkout  (chốt phiên & tạo bill)
module.exports.checkout = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    endAt: Joi.date().iso().optional(),
    discountLines: Joi.array().items(discountLine).default([]),
    surcharge: Joi.number().min(0).default(0),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).default('cash'),
    paid: Joi.boolean().default(false),
    note: Joi.string().trim().max(300).allow('', null).optional(),
  }),
};

// PATCH /sessions/:id/void  (hủy phiên sai thao tác)
module.exports.void = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    reason: Joi.string().trim().max(300).required(),
  }),
};

// GET /sessions/:id  (chi tiết)
module.exports.getOne = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.objectId = objectId;
module.exports.SESSION_STATUS = SESSION_STATUS;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
