// validators/setting.schema.js
const Joi = require('joi');

// ----- Helpers & constants -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const HHMM = /^\d{2}:\d{2}$/;
const ROUNDING_STEPS = [1, 5, 10, 15];
const ROUNDING_MODES = ['ceil', 'round', 'floor'];
const PAPER_SIZES = ['58mm', '80mm', 'A4'];
const BACKUP_TARGETS = ['local', 's3', 'gdrive'];

// ----- Sub-schemas -----
const shopSchema = Joi.object({
  name: Joi.string().trim().max(160).required(),
  logoUrl: Joi.string().trim().uri().allow(null, '').optional(),
  address: Joi.string().trim().max(300).allow('', null).optional(),
  phone: Joi.string().trim().max(32).allow('', null).optional(),
  taxId: Joi.string().trim().max(32).allow('', null).optional(),
  receiptHeader: Joi.string().trim().max(300).allow('', null).optional(),
  receiptFooter: Joi.string().trim().max(300).allow('', null).optional(),
  currency: Joi.string().trim().max(8).default('VND'),
});

const billingSchema = Joi.object({
  roundingStep: Joi.number().valid(...ROUNDING_STEPS).default(5),
  roundingMode: Joi.string().valid(...ROUNDING_MODES).default('ceil'),
  graceMinutes: Joi.number().integer().min(0).default(0),
});

const printSchema = Joi.object({
  paperSize: Joi.string().valid(...PAPER_SIZES).default('80mm'),
  showLogo: Joi.boolean().default(true),
  showQR: Joi.boolean().default(true),
  copies: Joi.number().integer().min(1).max(5).default(1),
  headerLines: Joi.array().items(Joi.string().trim().max(200)).max(10).default([]),
  footerLines: Joi.array().items(Joi.string().trim().max(200)).max(10).default([]),
});

const eReceiptSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  baseUrl: Joi.string().trim().uri().allow('', null).default(''),
  provider: Joi.string().trim().max(32).default('internal'),
});

const backupSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  timeOfDay: Joi.string().pattern(HHMM).default('02:00')
    .messages({ 'string.pattern.base': 'timeOfDay phải dạng HH:mm' }),
  retentionDays: Joi.number().integer().min(1).max(365).default(7),
  target: Joi.string().valid(...BACKUP_TARGETS).default('local'),
  targetConfig: Joi.any().allow(null).optional(), // tuỳ cấu hình (S3/GDrive…)
});

// ----- GET /settings (current) -----
// Hệ thống chỉ còn scope 'global' → không cần tham số
module.exports.getCurrent = {
  query: Joi.object({}).unknown(false),
};

// ----- PUT /settings (upsert toàn bộ, global only) -----
module.exports.upsert = {
  body: Joi.object({
    shop: shopSchema.required(),
    billing: billingSchema.required(),
    print: printSchema.required(),
    eReceipt: eReceiptSchema.required(),
    backup: backupSchema.required(),
  }),
};

// ----- PATCH từng phần (global only) -----
module.exports.setShop = { body: shopSchema.required() };
module.exports.setBilling = { body: billingSchema.required() };
module.exports.setPrint = { body: printSchema.required() };
module.exports.setEReceipt = { body: eReceiptSchema.required() };
module.exports.setBackup = { body: backupSchema.required() };

// (ĐÃ BỎ setScope vì không còn branch/global phân tách)

module.exports.objectId = objectId;
module.exports.HHMM = HHMM;
module.exports.ROUNDING_STEPS = ROUNDING_STEPS;
module.exports.ROUNDING_MODES = ROUNDING_MODES;
module.exports.PAPER_SIZES = PAPER_SIZES;
module.exports.BACKUP_TARGETS = BACKUP_TARGETS;
