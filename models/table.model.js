// models/table.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Trạng thái hợp lệ của bàn
const TABLE_STATUS = Object.freeze(['available', 'playing', 'reserved', 'maintenance']);

const TableSchema = new Schema(
  {
    // Tên bàn hiển thị: "Bàn 1", "Bàn 2", ...
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },

    // Khu vực (Area) chứa bàn này
    areaId: {
      type: Schema.Types.ObjectId,
      ref: 'Area',
      default: null,
      index: true,
    },

    // Trạng thái vận hành hiện tại của bàn
    status: {
      type: String,
      enum: TABLE_STATUS,
      default: 'available',
      index: true,
    },

    // Đơn giá/giờ áp dụng cho bàn này (vì đã bỏ TableType)
    ratePerHour: {
      type: Number,
      required: true, // bắt buộc vì không còn nguồn giá kế thừa
      min: 0,
    },

    // Thứ tự hiển thị trong lưới bàn (nhân viên)
    orderIndex: { type: Number, default: 0 },

    // Bàn đang sử dụng hay tạm ngưng trong cấu hình
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

// ===== Indexes =====

// Không trùng tên bàn trong cùng một khu vực
// (Nếu areaId = null, ràng buộc unique sẽ áp cho nhóm null — tránh trùng trong “khu vực chưa gán”)
TableSchema.index(
  { areaId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { name: { $type: 'string' } },
  }
);

// Hỗ trợ sắp xếp/lọc nhanh theo khu vực
TableSchema.index({ areaId: 1, orderIndex: 1 });

// Tên bàn để tìm nhanh (search theo prefix/sort theo tên)
TableSchema.index({ name: 1 });

// ===== Virtuals & helpers =====
TableSchema.virtual('isAvailable').get(function () {
  return this.active && this.status === 'available';
});

// Gợi ý: logic tính giá/giờ, làm tròn, khuyến mãi… hãy dùng billing.service.
// Model chỉ lưu dữ liệu gốc (ratePerHour) cho mỗi bàn.

module.exports = mongoose.model('Table', TableSchema);
module.exports.TABLE_STATUS = TABLE_STATUS;
