// controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const R = require('../utils/response');
const { issueTokens, signAccessToken } = require('../middlewares/auth.middleware');

const JWT_COOKIE = process.env.AUTH_SET_COOKIE === 'true';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE || 'Lax';
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'access_token';
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refresh_token';

/* ----------------------------- helpers ----------------------------- */

function sanitizeUser(u) {
  if (!u) return null;
  const obj = u.toJSON ? u.toJSON() : { ...u };
  delete obj.password;
  delete obj.passwordHash; // legacy field
  delete obj.__v;
  return obj;
}

const isBcryptHash = (s) =>
  typeof s === 'string' && /^\$2[aby]\$\d{2}\$/.test(s);

async function verifyPasswordFlexible(user, plain) {
  if (!user || !plain) return false;
  const pwd = String(plain);

  // 1. Ưu tiên method của model (hash trong field `password`)
  if (typeof user.comparePassword === 'function') {
    try {
      const ok = await user.comparePassword(pwd);
      if (ok) return true;
    } catch {
      // ignore
    }
  }

  // 2. Kiểm tra field `password` (schema mới)
  if (user.password) {
    // Nếu là bcrypt hash
    if (isBcryptHash(user.password)) {
      try {
        const ok = await bcrypt.compare(pwd, String(user.password));
        if (ok) return true;
      } catch {
        // ignore
      }
    } else {
      // Trường hợp legacy: password lưu plain-text
      if (String(user.password) === pwd) return true;
    }
  }

  // 3. Kiểm tra field legacy `passwordHash` (dữ liệu cũ trước khi sửa schema)
  if (user.passwordHash) {
    if (isBcryptHash(user.passwordHash)) {
      try {
        const ok = await bcrypt.compare(pwd, String(user.passwordHash));
        if (ok) return true;
      } catch {
        // ignore
      }
    } else {
      // Trường hợp xấu: passwordHash lại lưu plain-text
      if (String(user.passwordHash) === pwd) return true;
    }
  }

  return false;
}

async function setNewPassword(user, newPassword) {
  // Schema sẽ tự hash field `password` khi save (pre('save'))
  user.password = String(newPassword);

  // Dọn legacy field nếu có
  if (user.passwordHash) {
    user.passwordHash = undefined;
  }
}

function maybeSetCookies(res, { token, refreshToken }) {
  if (!JWT_COOKIE) return;
  const common = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    domain: COOKIE_DOMAIN,
    path: '/',
  };
  res.cookie(ACCESS_COOKIE_NAME, token, {
    ...common,
    maxAge: 60 * 60 * 1000, // 1h
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...common,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
  });
}

function maybeClearCookies(res) {
  if (!JWT_COOKIE) return;
  res.clearCookie(ACCESS_COOKIE_NAME, { path: '/', domain: COOKIE_DOMAIN });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/', domain: COOKIE_DOMAIN });
}

/* ----------------------------- controllers ----------------------------- */

// POST /auth/login
exports.login = R.asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const uname = String(username || '').trim().toLowerCase();

  // Need password for comparison
  const user = await User.findOne({ username: uname }).select('+password +passwordHash');

  if (!user || user.active === false) {
    return R.fail(res, 401, 'Sai tài khoản hoặc tài khoản đã bị vô hiệu');
  }

  const ok = await verifyPasswordFlexible(user, password);
  if (!ok) return R.fail(res, 401, 'Sai mật khẩu');

  // Nếu legacy lưu plain-text hoặc chỉ có passwordHash thì nâng cấp sang field `password`
  if (
    (!user.password || !isBcryptHash(user.password)) &&
    (user.password || user.passwordHash)
  ) {
    await setNewPassword(user, password);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = issueTokens(user);
  maybeSetCookies(res, tokens);

  return R.ok(res, { user: sanitizeUser(user), ...tokens }, 'Đăng nhập thành công');
});

// POST /auth/refresh (refresh token is already verified by middleware)
exports.refresh = R.asyncHandler(async (req, res) => {
  const token = signAccessToken(req.user);
  if (JWT_COOKIE) {
    res.cookie(ACCESS_COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      domain: COOKIE_DOMAIN,
      path: '/',
      maxAge: 60 * 60 * 1000,
    });
  }
  return R.ok(res, { token }, 'Token refreshed');
});

// GET /auth/me
exports.me = R.asyncHandler(async (req, res) => {
  if (!req.user) return R.fail(res, 401, 'Unauthorized');
  return R.ok(res, sanitizeUser(req.user));
});

// PUT /auth/profile
exports.updateProfile = R.asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +passwordHash');
  if (!user) return R.fail(res, 404, 'User not found');

  const { name, email, phone, avatar } = req.body;
  if (typeof name !== 'undefined') user.name = name;
  if (typeof email !== 'undefined') user.email = email;
  if (typeof phone !== 'undefined') user.phone = phone;
  if (typeof avatar !== 'undefined') user.avatar = avatar;

  await user.save();
  return R.ok(res, sanitizeUser(user), 'Cập nhật hồ sơ thành công');
});

// PUT /auth/change-password
exports.changePassword = R.asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password +passwordHash');
  if (!user) return R.fail(res, 404, 'User not found');

  const ok = await verifyPasswordFlexible(user, oldPassword);
  if (!ok) return R.fail(res, 400, 'Mật khẩu cũ không đúng');

  await setNewPassword(user, newPassword);
  await user.save();

  return R.ok(res, null, 'Đổi mật khẩu thành công');
});

// POST /auth/logout
exports.logout = R.asyncHandler(async (_req, res) => {
  maybeClearCookies(res);
  return R.ok(res, null, 'Đã đăng xuất');
});
