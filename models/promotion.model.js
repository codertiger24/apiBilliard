// models/promotion.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PROMO_SCOPES   = Object.freeze(['time', 'product', 'bill']);  // phạm vi tác động
const DISCOUNT_TYPES = Object.freeze(['percent', 'value']);         // % hoặc số tiền
const APPLY_TARGETS  = Object.freeze(['play', 'service', 'bill']);  // áp lên tiền giờ / dịch vụ / toàn bộ

// 'HH:mm'
const HHMM = /^\d{2}:\d{2}$/;

// Khung giờ áp dụng (có thể nhiều khung)
const TimeRangeSchema = new Schema(
  {
    from: { type: String, match: HHMM, required: true }, // '10:00'
    to:   { type: String, match: HHMM, required: true }, // '15:00'
  },
  { _id: false }
);

// Điều kiện theo thời gian/bối cảnh
const TimeRuleSchema = new Schema(
  {
    validFrom:  { type: Date, default: null },   // ngày bắt đầu (bao gồm)
    validTo:    { type: Date, default: null },   // ngày kết thúc (bao gồm, 23:59)
    daysOfWeek: { type: [Number], default: [] }, // 0=CN ... 6=Th7; rỗng = mọi ngày
    timeRanges: { type: [TimeRangeSchema], default: [] }, // rỗng = mọi giờ
    // ĐÃ BỎ tableTypes (không còn loại bàn)
    minMinutes: { type: Number, default: 0, min: 0 },     // yêu cầu tối thiểu phút chơi (nếu dùng)
  },
  { _id: false }
);

// Điều kiện theo sản phẩm (áp dụng mức giảm lên từng item khớp)
const ProductRuleSchema = new Schema(
  {
    categories: [{ type: Schema.Types.ObjectId, ref: 'ProductCategory' }],
    products:   [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    // combo (tùy chọn): mua đủ qty thì giảm
    combo: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        qty:     { type: Number, required: true, min: 1 },
      },
    ],
  },
  { _id: false }
);

// Điều kiện ở cấp hóa đơn
const BillRuleSchema = new Schema(
  {
    minSubtotal:      { type: Number, default: 0, min: 0 },
    minServiceAmount: { type: Number, default: 0, min: 0 },
    minPlayMinutes:   { type: Number, default: 0, min: 0 },
    // ĐÃ BỎ tableTypes (không còn loại bàn)
  },
  { _id: false }
);

// Định nghĩa phần giảm giá
const DiscountSchema = new Schema(
  {
    type:      { type: String, enum: DISCOUNT_TYPES, required: true }, // percent|value
    value:     { type: Number, required: true, min: 0 },               // nếu percent: 0..100
    applyTo:   { type: String, enum: APPLY_TARGETS, default: 'bill' },
    maxAmount: { type: Number, default: null, min: 0 },                // trần giảm (optional)
  },
  { _id: false }
);

const PromotionSchema = new Schema(
  {
    name:  { type: String, required: true, trim: true, maxlength: 160 },
    code:  { type: String, required: true, trim: true, uppercase: true, maxlength: 32 }, // duy nhất toàn hệ thống
    scope: { type: String, enum: PROMO_SCOPES, required: true, index: true },

    active: { type: Boolean, default: true, index: true },

    // Thứ tự áp dụng (nhỏ trước, lớn sau) khi có nhiều KM cùng lúc
    applyOrder: { type: Number, default: 100, index: true },

    // Cho phép cộng dồn với khuyến mãi khác?
    stackable: { type: Boolean, default: true },

    // Điều kiện theo từng scope
    timeRule:    { type: TimeRuleSchema,    default: () => ({}) },
    productRule: { type: ProductRuleSchema, default: () => ({}) },
    billRule:    { type: BillRuleSchema,    default: () => ({}) },

    // Mức giảm
    discount: { type: DiscountSchema, required: true },

    // Ghi chú/hiển thị
    description: { type: String, trim: true, default: '' },

    // ĐÃ BỎ branchId (không còn đa chi nhánh)
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

// ===== Indexes / Unique =====
PromotionSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
PromotionSchema.index({ active: 1, applyOrder: 1 });
PromotionSchema.index({ 'timeRule.validFrom': 1, 'timeRule.validTo': 1 });

// ===== Hooks: chuẩn hoá code =====
function normalizeCode(v) {
  return (v || '').toString().trim().toUpperCase();
}
PromotionSchema.pre('save', function (next) {
  if (this.isModified('code')) this.code = normalizeCode(this.code);
  next();
});
PromotionSchema.pre('findOneAndUpdate', function (next) {
  const u = this.getUpdate() || {};
  if (u.code) u.code = normalizeCode(u.code);
  if (u.$set?.code) u.$set.code = normalizeCode(u.$set.code);
  this.setUpdate(u);
  next();
});

// ===== Helpers =====
/** Kiểm tra khung ngày/giờ xem KM có hiệu lực tại một thời điểm cụ thể không */
PromotionSchema.methods.isActiveAt = function (at = new Date()) {
  if (!this.active) return false;

  const tr = this.timeRule || {};
  const { validFrom, validTo, daysOfWeek = [], timeRanges = [] } = tr;

  if (validFrom && at < new Date(validFrom)) return false;
  if (validTo) {
    const endOfDay = new Date(validTo);
    endOfDay.setHours(23, 59, 59, 999);
    if (at > endOfDay) return false;
  }

  if (Array.isArray(daysOfWeek) && daysOfWeek.length) {
    const dow = at.getDay(); // 0..6
    if (!daysOfWeek.includes(dow)) return false;
  }

  if (Array.isArray(timeRanges) && timeRanges.length) {
    const hh = String(at.getHours()).padStart(2, '0');
    const mm = String(at.getMinutes()).padStart(2, '0');
    const cur = `${hh}:${mm}`;
    const hit = timeRanges.some(
      (r) => HHMM.test(r.from) && HHMM.test(r.to) && r.from <= cur && cur <= r.to
    );
    if (!hit) return false;
  }

  return true;
};

module.exports = mongoose.model('Promotion', PromotionSchema);
module.exports.PROMO_SCOPES   = PROMO_SCOPES;
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
module.exports.APPLY_TARGETS  = APPLY_TARGETS;
