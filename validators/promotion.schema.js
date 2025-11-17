// validators/promotion.schema.js
const Joi = require('joi');

// ---------- Helpers ----------
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const CODE_REGEX = /^[A-Z0-9_-]+$/;
const HHMM = /^\d{2}:\d{2}$/;

const SCOPE = ['time', 'product', 'bill'];
const DISCOUNT_TYPES = ['percent', 'value'];
const APPLY_TARGETS = ['play', 'service', 'bill'];

// Khung giờ trong ngày
const timeRangeSchema = Joi.object({
  from: Joi.string().pattern(HHMM).required().messages({ 'string.pattern.base': 'from phải dạng HH:mm' }),
  to:   Joi.string().pattern(HHMM).required().messages({ 'string.pattern.base': 'to phải dạng HH:mm' }),
});

// Điều kiện thời gian/bối cảnh (đÃ BỎ tableTypes)
const timeRuleSchema = Joi.object({
  validFrom:  Joi.date().iso().allow(null),
  validTo:    Joi.date().iso().allow(null),
  daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).unique().default([]),
  timeRanges: Joi.array().items(timeRangeSchema).default([]),
  minMinutes: Joi.number().integer().min(0).default(0),
}).custom((v, helpers) => {
  if (v.validFrom && v.validTo && new Date(v.validFrom) > new Date(v.validTo)) {
    return helpers.error('any.invalid', { message: 'validFrom phải <= validTo' });
  }
  return v;
});

// Điều kiện sản phẩm
const productRuleSchema = Joi.object({
  categories: Joi.array().items(objectId()).unique().default([]),
  products:   Joi.array().items(objectId()).unique().default([]),
  combo: Joi.array().items(Joi.object({
    product: objectId().required(),
    qty: Joi.number().integer().min(1).required(),
  })).default([]),
});

// Điều kiện hóa đơn (đÃ BỎ tableTypes)
const billRuleSchema = Joi.object({
  minSubtotal:      Joi.number().min(0).default(0),
  minServiceAmount: Joi.number().min(0).default(0),
  minPlayMinutes:   Joi.number().integer().min(0).default(0),
});

// Cấu hình giảm giá
const discountSchema = Joi.object({
  type: Joi.string().valid(...DISCOUNT_TYPES).required(),
  value: Joi.number().min(0).required(), // percent: 0..100
  applyTo: Joi.string().valid(...APPLY_TARGETS).default('bill'),
  maxAmount: Joi.number().min(0).allow(null),
});

// ---------- Schemas ----------

// GET /promotions
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    q: Joi.string().trim().allow('', null),             // tìm theo name/code
    code: Joi.string().trim().uppercase().pattern(CODE_REGEX).messages({
      'string.pattern.base': 'code chỉ gồm A-Z, 0-9, _, -',
    }),
    scope: Joi.string().valid(...SCOPE).optional(),
    active: Joi.boolean().optional(),
    at: Joi.date().iso().optional(),                    // lọc hiệu lực tại thời điểm

    // sort: 'applyOrder' | '-applyOrder' | 'createdAt' | '-createdAt' | 'name' | '-name' | 'code' | '-code'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(applyOrder|createdAt|name|code)$/)
      .default('applyOrder'),
  }),
};

// POST /promotions
module.exports.create = {
  body: Joi.object({
    name: Joi.string().trim().max(160).required(),
    code: Joi.string().trim().uppercase().max(32).pattern(CODE_REGEX).required()
      .messages({ 'string.pattern.base': 'code chỉ gồm A-Z, 0-9, _, -' }),
    scope: Joi.string().valid(...SCOPE).required(),

    active: Joi.boolean().default(true),
    applyOrder: Joi.number().integer().min(0).default(100),
    stackable: Joi.boolean().default(true),

    timeRule:    timeRuleSchema.when('scope', { is: 'time',    then: Joi.required(), otherwise: Joi.forbidden() }),
    productRule: productRuleSchema.when('scope', { is: 'product', then: Joi.required(), otherwise: Joi.forbidden() }),
    billRule:    billRuleSchema.when('scope', { is: 'bill',    then: Joi.required(), otherwise: Joi.forbidden() }),

    discount: discountSchema.required(),

    description: Joi.string().trim().max(500).allow('', null).optional(),
  }),
};

// PUT /promotions/:id
module.exports.update = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    name: Joi.string().trim().max(160),
    code: Joi.string().trim().uppercase().max(32).pattern(CODE_REGEX)
      .messages({ 'string.pattern.base': 'code chỉ gồm A-Z, 0-9, _, -' }),
    scope: Joi.string().valid(...SCOPE), // nếu đổi scope, rule tương ứng nên gửi lại

    active: Joi.boolean(),
    applyOrder: Joi.number().integer().min(0),
    stackable: Joi.boolean(),

    timeRule: timeRuleSchema.allow(null),
    productRule: productRuleSchema.allow(null),
    billRule: billRuleSchema.allow(null),

    discount: discountSchema,

    description: Joi.string().trim().max(500).allow('', null),
  }).min(1),
};

// PATCH /promotions/:id/active
module.exports.setActive = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// PATCH /promotions/:id/apply-order
module.exports.setApplyOrder = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    applyOrder: Joi.number().integer().min(0).required(),
  }),
};

// GET /promotions/:id
module.exports.getOne = {
  params: Joi.object({ id: objectId().required() }),
};

// DELETE /promotions/:id
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.objectId = objectId;
module.exports.CODE_REGEX = CODE_REGEX;
module.exports.HHMM = HHMM;
module.exports.SCOPE = SCOPE;
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
module.exports.APPLY_TARGETS = APPLY_TARGETS;
