// models/bill.model.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const PAYMENT_METHODS = Object.freeze(['cash', 'card', 'transfer', 'other']);
const DISCOUNT_TYPES = Object.freeze(['percent', 'value']); // % hoặc số tiền tuyệt đối
const ITEM_TYPES = Object.freeze(['play', 'product']);

/** Item trên hóa đơn
 *  - type = 'play': minutes, ratePerHour, amount
 *  - type = 'product': productId, nameSnapshot, priceSnapshot, qty, amount
 */
const BillItemSchema = new Schema(
  {
    type: { type: String, enum: ITEM_TYPES, required: true },

    // ----- PLAY -----
    minutes: { type: Number, min: 0, default: 0 },         // phút chốt sau làm tròn
    ratePerHour: { type: Number, min: 0, default: 0 },     // đơn giá/h tại thời điểm chốt

    // ----- PRODUCT -----
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
    nameSnapshot: { type: String, trim: true, default: '' },
    priceSnapshot: { type: Number, min: 0, default: 0 },
    qty: { type: Number, min: 0, default: 0 },

    // ----- COMMON -----
    amount: { type: Number, min: 0, default: 0 }, // số tiền item (đóng băng)
    note: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

/** Một dòng khuyến mãi áp trên hóa đơn */
const DiscountLineSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },             // vd: "KM giờ trưa 20%"
    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    value: { type: Number, min: 0, required: true },             // nếu percent: 0..100
    amount: { type: Number, min: 0, default: 0 },                // số tiền trừ thực tế (đã tính)
    meta: { type: Schema.Types.Mixed, default: null },           // thông tin rule áp dụng
  },
  { _id: true }
);

const BillSchema = new Schema(
  {
    code: { type: String, trim: true, uppercase: true, unique: true, index: true }, // vd: B240101-AB12CD

    session: { type: Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    table:   { type: Schema.Types.ObjectId, ref: 'Table',   required: true, index: true },

    // Snapshot tên bàn để in nhanh (tránh join khi render)
    tableName: { type: String, trim: true, default: '' },

    // Snapshot khu vực (để lọc/báo cáo ổn định theo khu vực)
    areaId: { type: Schema.Types.ObjectId, ref: 'Area', default: null, index: true },

    // Danh sách items (đã chốt)
    items: { type: [BillItemSchema], default: [] },

    // Tổng theo nhóm (được tính & đóng băng khi tạo bill)
    playAmount:    { type: Number, min: 0, default: 0 },
    serviceAmount: { type: Number, min: 0, default: 0 },

    // Tổng trước giảm
    subTotal: { type: Number, min: 0, default: 0 },

    // Khuyến mãi nhiều dòng
    discounts: { type: [DiscountLineSchema], default: [] },

    // Phụ thu (nếu có)
    surcharge: { type: Number, min: 0, default: 0 },

    // Tổng cuối cùng
    total: { type: Number, min: 0, default: 0 },

    // Thanh toán
    paid:          { type: Boolean, default: false, index: true },
    paidAt:        { type: Date, default: null, index: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash', index: true },

    // Nhân viên lập/thu ngân
    staff: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Ghi chú
    note: { type: String, trim: true, default: '' },
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

// ===== Indexes phụ trợ =====
BillSchema.index({ createdAt: -1 });
BillSchema.index({ table: 1, createdAt: -1 });
BillSchema.index({ staff: 1, createdAt: -1 });
BillSchema.index({ paid: 1, createdAt: -1 });
BillSchema.index({ areaId: 1, createdAt: -1 });

// ===== Helpers =====

/** Tính lại playAmount, serviceAmount, subTotal dựa trên items (KHÔNG lưu). */
BillSchema.methods.computeGroups = function () {
  let play = 0;
  let svc = 0;
  for (const it of this.items || []) {
    const amt = Number(it.amount || 0);
    if (it.type === 'play') play += amt;
    else svc += amt;
  }
  const subTotal = play + svc;
  return { playAmount: play, serviceAmount: svc, subTotal };
};

/** Tính lại tổng giảm giá (sum of discounts.amount) và total (KHÔNG lưu).
 *  Nếu discount.amount chưa có, sẽ tự tính theo rule (percent/value) dựa trên subTotal.
 */
BillSchema.methods.computeTotals = function () {
  const groups = this.computeGroups();
  let discountTotal = 0;

  (this.discounts || []).forEach((d) => {
    let amt = Number(d.amount || 0);
    if (!amt) {
      if (d.type === 'percent') {
        const pct = Math.max(0, Math.min(100, Number(d.value || 0)));
        amt = Math.round((groups.subTotal * pct) / 100);
      } else {
        amt = Math.round(Math.max(0, Number(d.value || 0)));
      }
    }
    d.amount = amt; // ghi tạm vào instance (chưa lưu DB)
    discountTotal += amt;
  });

  // Không cho giảm vượt subTotal
  discountTotal = Math.min(discountTotal, groups.subTotal);

  const surcharge = Math.max(0, Number(this.surcharge || 0));
  const total = Math.max(0, groups.subTotal - discountTotal + surcharge);

  return { ...groups, discountTotal, surcharge, total };
};

/** Sinh code nếu thiếu: BYYYYMMDD-<6HEX> (không đảm bảo theo thứ tự tăng, nhưng duy nhất cao) */
function generateBillCode() {
  const d = new Date();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex
  return `B${y}${mm}${dd}-${rand}`;
}

// ===== Hooks =====

/** Trước khi validate: nếu thiếu code → sinh code; nếu thiếu totals → tính lại */
BillSchema.pre('validate', function (next) {
  if (!this.code) this.code = generateBillCode();

  const hasGroups =
    this.playAmount > 0 || this.serviceAmount > 0 || this.subTotal > 0 || this.total > 0;

  if (!hasGroups) {
    const t = this.computeTotals();
    this.playAmount    = t.playAmount;
    this.serviceAmount = t.serviceAmount;
    this.subTotal      = t.subTotal;
    this.surcharge     = t.surcharge;
    this.total         = t.total;
  } else {
    // Đảm bảo total luôn nhất quán nếu caller không tự set
    if (!this.total || this.total <= 0) {
      const t = this.computeTotals();
      this.total = t.total;
    }
  }
  next();
});

module.exports = mongoose.model('Bill', BillSchema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.ITEM_TYPES = ITEM_TYPES;
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
