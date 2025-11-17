// models/area.model.js
const mongoose = require('mongoose');

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/; // #RGB hoặc #RRGGBB

const AreaSchema = new mongoose.Schema(
  {
    // Tên khu vực, ví dụ: "Khu vực 1"
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    // Mã ngắn hiển thị (tùy chọn), ví dụ: KV1, KV2
    code: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 20,
    },

    // Màu nhãn (tùy chọn) dạng #RRGGBB hoặc #RGB để hiển thị badge
    color: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || HEX_COLOR_REGEX.test(v),
        message: 'Color must be in HEX format, e.g. #4CAF50',
      },
    },

    // Thứ tự sắp xếp trên giao diện
    orderIndex: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Bật/tắt hoạt động (ẩn/hiện trong bộ lọc UI)
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Chuẩn hoá code trước khi validate/lưu
AreaSchema.pre('validate', function normalizeCode(next) {
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }
  next();
});

// Chỉ mục & ràng buộc
AreaSchema.index({ name: 1 }, { unique: true });   // tên khu vực là duy nhất toàn hệ thống
AreaSchema.index({ orderIndex: 1 });
AreaSchema.index({ active: 1 });

// Chuẩn JSON trả về: thêm id, ẩn _id và __v
AreaSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Area', AreaSchema);
