// models/audit-log.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ACTIONS = Object.freeze([
  // Auth
  'LOGIN', 'LOGOUT',

  // Table / Session
  'TABLE_CREATE', 'TABLE_UPDATE', 'TABLE_DELETE',
  'TABLE_STATUS_CHANGE', 'TABLE_CHECKIN', 'TABLE_CHECKOUT',
  'SESSION_OPEN', 'SESSION_ADD_ITEM', 'SESSION_UPDATE_ITEM', 'SESSION_REMOVE_ITEM',
  'SESSION_CLOSE', 'SESSION_VOID',

  // Bill
  'BILL_CREATE', 'BILL_PAY', 'BILL_VOID', 'BILL_REFUND',

  // Product / Category
  'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DELETE',
  'CATEGORY_CREATE', 'CATEGORY_UPDATE', 'CATEGORY_DELETE',

  // Promotion / Setting / User
  'PROMOTION_CREATE', 'PROMOTION_UPDATE', 'PROMOTION_DELETE',
  'SETTING_UPDATE',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_ROLE_CHANGE',
]);

const TARGETS = Object.freeze([
  'auth', 'table', 'session', 'bill', 'product', 'category',
  'promotion', 'setting', 'user', 'system'
]);

const SOURCES = Object.freeze(['api', 'web', 'system']);

const ClientInfoSchema = new Schema({
  ip: { type: String, default: null, trim: true },
  userAgent: { type: String, default: null, trim: true },
  source: { type: String, enum: SOURCES, default: 'api', index: true }, // api|web|system
}, { _id: false });

const AuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // null = system job
    action: { type: String, enum: ACTIONS, required: true, index: true },

    targetType: { type: String, enum: TARGETS, required: true, index: true },
    // Có thể là ObjectId (bill, session, table...) hoặc string (auth/system)
    targetId: { type: Schema.Types.Mixed, default: null, index: true },
    targetLabel: { type: String, default: '', trim: true }, // ví dụ: "Bàn 1", "BILL B20251022-AB12CD"

    // Dữ liệu ngữ cảnh: trước/sau, payload, tham số...
    meta: { type: Schema.Types.Mixed, default: null },

    // Thông tin client
    client: { type: ClientInfoSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ===== Indexes hữu ích =====
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });

/** Helper: trích IP thực từ req (tôn trọng proxy) */
function getIpFromReq(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return xf.split(',')[0].trim();
  }
  // Express sẽ có req.ip khi set trust proxy phù hợp
  return req?.ip || req?.connection?.remoteAddress || null;
}

/** Helper: xác định source từ URL hoặc caller */
function detectSource(req, fallback = 'api') {
  if (!req) return fallback;
  const path = req.originalUrl || req.url || '';
  if (path.startsWith('/api')) return 'api';
  return 'web';
}

/**
 * Static: ghi log nhanh từ controller/service
 * @param {Object} p
 * @param {ObjectId|null} p.actor - user._id hoặc null (system)
 * @param {String} p.action - một trong ACTIONS
 * @param {String} p.targetType - một trong TARGETS
 * @param {any} [p.targetId] - ObjectId hoặc string
 * @param {String} [p.targetLabel] - tên hiển thị nhanh (vd Bàn 1, BillCode...)
 * @param {any} [p.meta] - dữ liệu thêm (before/after/payload)
 * @param {import('express').Request} [p.req] - để lấy ip/ua/source
 */
AuditLogSchema.statics.log = async function ({
  actor, action, targetType, targetId = null, targetLabel = '',
  meta = null, req = null, source = null
}) {
  const client = {
    ip: getIpFromReq(req),
    userAgent: req?.get?.('user-agent') || null,
    source: source || detectSource(req, 'api'),
  };

  const doc = await this.create({
    actor, action, targetType, targetId, targetLabel, meta, client,
  });

  return doc;
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.TARGETS = TARGETS;
module.exports.SOURCES = SOURCES;
