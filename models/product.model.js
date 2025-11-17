// models/product.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    // Mã hàng hoá: duy nhất (toàn hệ thống). Cho phép null.
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 64,
      default: null,
    },

    // Nhóm: nước / đồ ăn / khác...
    category: {
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: true,
      index: true,
    },

    // Giá bán hiện tại (snapshot sẽ ghi vào bill khi thêm item)
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // Đơn vị hiển thị: "chai", "lon", "ly", "gói", ...
    unit: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },

    // Có phải dịch vụ/phi vật phẩm không? (thường false cho đồ uống)
    isService: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Ảnh minh hoạ (đường dẫn public /uploads/...)
    images: {
      type: [String],
      default: [],
    },

    // Thẻ gợi ý tìm kiếm/nhóm
    tags: {
      type: [String],
      default: [],
    },

    // Kích hoạt hay tạm ngưng bán
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Ghi chú tuỳ ý
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
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

// ===== Indexes =====

// SKU duy nhất toàn hệ thống (cho phép null)
ProductSchema.index(
  { sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $type: 'string' } },
  }
);

// Tìm nhanh theo tên, lọc theo kích hoạt & danh mục
ProductSchema.index({ name: 1 });
ProductSchema.index({ active: 1, category: 1 });

// ===== Hooks: chuẩn hoá SKU =====
function normalizeSKU(v) {
  return (v || '').toString().trim().toUpperCase() || null;
}

ProductSchema.pre('save', function (next) {
  if (this.isModified('sku')) this.sku = normalizeSKU(this.sku);
  next();
});

ProductSchema.pre('findOneAndUpdate', function (next) {
  const u = this.getUpdate() || {};
  if (u.sku) u.sku = normalizeSKU(u.sku);
  if (u.$set?.sku) u.$set.sku = normalizeSKU(u.$set.sku);
  this.setUpdate(u);
  next();
});

// ===== Virtuals/Helpers =====
ProductSchema.virtual('primaryImage').get(function () {
  return Array.isArray(this.images) && this.images.length ? this.images[0] : null;
});

module.exports = mongoose.model('Product', ProductSchema);
