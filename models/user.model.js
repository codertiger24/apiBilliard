// models/user.model.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;
const ROLES = ['staff', 'admin'];

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      minlength: 3,
      maxlength: 64,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // cho phép null/undefined trùng nhau
      maxlength: 120,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/i,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // mặc định không trả về
    },
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
    },
    avatar: {
      type: String, // URL tương đối: /uploads/...
      default: null,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'staff',
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Index phụ trợ tìm kiếm nhanh
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1, active: 1 });

// Hash password trước khi lưu
UserSchema.pre('save', async function handleHash(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

// Hash khi update qua findOneAndUpdate
UserSchema.pre('findOneAndUpdate', async function handleHashUpdate(next) {
  try {
    const update = this.getUpdate() || {};
    // hỗ trợ cả dạng trực tiếp và $set
    if (update.password) {
      update.password = await bcrypt.hash(update.password, 10);
      this.setUpdate(update);
    } else if (update.$set && update.$set.password) {
      update.$set.password = await bcrypt.hash(update.$set.password, 10);
      this.setUpdate(update);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// So khớp mật khẩu
UserSchema.methods.comparePassword = function comparePassword(plain) {
  // Lưu ý: cần .select('+password') khi truy vấn user để có field này
  return bcrypt.compare(plain, this.password || '');
};

// Trợ giúp role
UserSchema.methods.hasRole = function hasRole(role) {
  return this.role === role;
};

module.exports = mongoose.model('User', UserSchema);
module.exports.ROLES = ROLES;
