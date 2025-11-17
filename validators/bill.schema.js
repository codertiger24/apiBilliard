// validators/bill.schema.js
const Joi = require('joi');

// ----- Helpers -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
const PAPER_SIZES = ['58mm', '80mm', 'A4'];

// ===== GET /bills  (list + filter) =====
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(50),

    q: Joi.string().trim().allow('', null),              // tìm theo code
    table: objectId().optional(),
    staff: objectId().optional(),
    areaId: objectId().allow(null, ''),                  // lọc theo khu vực (snapshot)

    paid: Joi.boolean().optional(),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).optional(),

    from: Joi.date().iso().optional(),                   // lọc theo createdAt
    to: Joi.date().iso().optional(),

    minTotal: Joi.number().min(0).optional(),
    maxTotal: Joi.number().min(0).optional(),

    // sort: '-createdAt' | 'createdAt' | '-paidAt' | 'paidAt' | '-total' | 'total' | 'code' | '-code'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(createdAt|paidAt|total|code)$/)
      .default('-createdAt'),
  }).with('minTotal', 'maxTotal'),
};

// ===== GET /bills/:id =====
module.exports.getOne = {
  params: Joi.object({ id: objectId().required() }),
};

// ===== PATCH /bills/:id/pay  (đánh dấu thanh toán) =====
module.exports.pay = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).required(),
    paidAt: Joi.date().iso().optional(),                 // mặc định now ở controller
  }),
};

// ===== PATCH /bills/:id/note  (cập nhật ghi chú) =====
module.exports.setNote = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    note: Joi.string().trim().max(500).allow('', null).required(),
  }),
};

// ===== GET /bills/export.xlsx  (xuất Excel danh sách) =====
module.exports.exportExcel = {
  query: Joi.object({
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
    areaId: objectId().allow(null, ''),                  // lọc theo khu vực
    paidOnly: Joi.boolean().default(true),
  }),
};

// ===== GET /bills/:id/print  (xuất PDF) =====
module.exports.print = {
  params: Joi.object({ id: objectId().required() }),
  query: Joi.object({
    paperSize: Joi.string().valid(...PAPER_SIZES).default('80mm'),
    embedQR: Joi.boolean().default(true),
  }),
};

// ===== GET /bills/:id/qr  (ảnh QR) =====
module.exports.qr = {
  params: Joi.object({ id: objectId().required() }),
};

// (Tùy chọn) DELETE /bills/:id — nếu cho phép xóa mềm/hủy, thêm schema tại đây
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.objectId = objectId;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.PAPER_SIZES = PAPER_SIZES;
