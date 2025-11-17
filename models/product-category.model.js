// models/product-category.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // PO, DRINK, FOOD...
      maxlength: 32,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    icon: {
      type: String, // URL hoặc class icon (tùy UI)
      default: null,
    },
    color: {
      type: String, // ví dụ: #10b981
      default: null,
    },
    orderIndex: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
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

// ===== Indexes / Uniques (toàn hệ thống) =====
ProductCategorySchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);

ProductCategorySchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { name: { $type: 'string' } } }
);

ProductCategorySchema.index({ orderIndex: 1 });

// Chuẩn hoá code trước khi lưu/cập nhật
function normalizeCode(val) {
  return (val || '').toString().trim().toUpperCase();
}

ProductCategorySchema.pre('save', function (next) {
  if (this.isModified('code')) this.code = normalizeCode(this.code);
  next();
});

ProductCategorySchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  if (update.code) update.code = normalizeCode(update.code);
  if (update.$set?.code) update.$set.code = normalizeCode(update.$set.code);
  this.setUpdate(update);
  next();
});

// Helper ảo
ProductCategorySchema.virtual('isActive').get(function () {
  return !!this.active;
});

module.exports = mongoose.model('ProductCategory', ProductCategorySchema);
