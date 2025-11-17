// models/setting.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const HHMM = /^\d{2}:\d{2}$/;
const ROUNDING_STEPS = [1, 5, 10, 15];
const ROUNDING_MODES = ['ceil', 'round', 'floor']; // cách làm tròn phút
const PAPER_SIZES   = ['58mm', '80mm', 'A4'];      // khổ in phổ biến POS
const BACKUP_TARGETS = ['local', 's3', 'gdrive'];  // tuỳ chọn mở rộng

// ---- Sub-schemas ----
const ShopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    logoUrl: { type: String, default: null }, // /uploads/...
    address: { type: String, default: '', trim: true, maxlength: 300 },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
    taxId: { type: String, default: '', trim: true, maxlength: 32 },
    receiptHeader: { type: String, default: '', trim: true, maxlength: 300 },
    receiptFooter: { type: String, default: '', trim: true, maxlength: 300 },
    currency: { type: String, default: 'VND', trim: true, maxlength: 8 },
  },
  { _id: false }
);

const BillingSchema = new Schema(
  {
    roundingStep: { type: Number, default: 5 }, // 1|5|10|15
    roundingMode: { type: String, enum: ROUNDING_MODES, default: 'ceil' },
    graceMinutes: { type: Number, default: 0, min: 0 }, // miễn phí dưới X phút
  },
  { _id: false }
);

const PrintSchema = new Schema(
  {
    paperSize: { type: String, enum: PAPER_SIZES, default: '80mm' },
    showLogo: { type: Boolean, default: true },
    showQR: { type: Boolean, default: true },
    copies: { type: Number, default: 1, min: 1, max: 5 },
    headerLines: { type: [String], default: [] },
    footerLines: { type: [String], default: [] },
  },
  { _id: false }
);

const EReceiptSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    // baseUrl để sinh link bill điện tử, vd: https://billiard.local/bills/:id/print
    baseUrl: { type: String, default: '', trim: true, maxlength: 300 },
    // nếu dùng QR nội bộ thì không cần provider; nếu tích hợp Zalo OA có thể để meta ở đây
    provider: { type: String, default: 'internal', trim: true, maxlength: 32 },
  },
  { _id: false }
);

const BackupSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    timeOfDay: { type: String, default: '02:00', match: HHMM }, // giờ chạy hằng ngày
    retentionDays: { type: Number, default: 7, min: 1, max: 365 },
    target: { type: String, enum: BACKUP_TARGETS, default: 'local' },
    targetConfig: { type: Schema.Types.Mixed, default: null }, // cấu hình S3/GDrive...
  },
  { _id: false }
);

// ---- Main schema ----
// ĐÃ BỎ branch scope → chỉ còn 'global'
const SettingSchema = new Schema(
  {
    scope: { type: String, enum: ['global'], default: 'global', index: true },

    shop: { type: ShopSchema, default: () => ({ name: 'Billiard POS' }) },

    billing: {
      type: BillingSchema,
      default: () => ({ roundingStep: 5, roundingMode: 'ceil', graceMinutes: 0 }),
    },

    print: { type: PrintSchema, default: () => ({}) },

    eReceipt: { type: EReceiptSchema, default: () => ({ enabled: true }) },

    backup: { type: BackupSchema, default: () => ({}) },

    // Theo dõi ai cập nhật
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
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

// ---- Indexes ----
// Chỉ 1 bản ghi duy nhất cho scope='global'
SettingSchema.index({ scope: 1 }, { unique: true });

// ---- Hooks: chuẩn hoá & ràng buộc ----
SettingSchema.pre('validate', function (next) {
  // Chuẩn hoá roundingStep vào tập giá trị hợp lệ
  const step = Number(this.billing?.roundingStep ?? 5);
  if (!ROUNDING_STEPS.includes(step)) {
    const nearest = ROUNDING_STEPS.reduce((a, b) =>
      Math.abs(b - step) < Math.abs(a - step) ? b : a
    );
    this.billing.roundingStep = nearest;
  }
  // Grace không âm
  if (this.billing && this.billing.graceMinutes < 0) {
    this.billing.graceMinutes = 0;
  }
  next();
});

// ---- Helpers ----
SettingSchema.methods.getRounding = function () {
  const st = this.billing?.roundingStep ?? 5;
  const md = this.billing?.roundingMode ?? 'ceil';
  const gr = this.billing?.graceMinutes ?? 0;
  return { roundingStep: st, roundingMode: md, graceMinutes: gr };
};

SettingSchema.methods.getReceiptInfo = function () {
  const s = this.shop || {};
  const p = this.print || {};
  const e = this.eReceipt || {};
  return {
    shop: {
      name: s.name,
      logoUrl: s.logoUrl,
      address: s.address,
      phone: s.phone,
      taxId: s.taxId,
      header: s.receiptHeader,
      footer: s.receiptFooter,
      currency: s.currency || 'VND',
    },
    print: {
      paperSize: p.paperSize || '80mm',
      showLogo: !!p.showLogo,
      showQR: !!p.showQR,
      copies: p.copies || 1,
      headerLines: Array.isArray(p.headerLines) ? p.headerLines : [],
      footerLines: Array.isArray(p.footerLines) ? p.footerLines : [],
    },
    eReceipt: {
      enabled: !!e.enabled,
      baseUrl: e.baseUrl || '',
      provider: e.provider || 'internal',
    },
  };
};

module.exports = mongoose.model('Setting', SettingSchema);
module.exports.ROUNDING_STEPS = ROUNDING_STEPS;
module.exports.ROUNDING_MODES = ROUNDING_MODES;
module.exports.PAPER_SIZES   = PAPER_SIZES;
module.exports.BACKUP_TARGETS = BACKUP_TARGETS;
