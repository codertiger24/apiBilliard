// validators/user.schema.js
const Joi = require('joi');

// -------- Common pieces --------
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const ROLES = ['staff', 'admin'];

const username = Joi.string()
  .trim()
  .min(3)
  .max(64)
  .lowercase()
  .pattern(/^[a-z0-9._-]+$/)
  .messages({ 'string.pattern.base': 'username chỉ gồm a-z, 0-9, ., _, -' });

const password = Joi.string().min(6).max(128);

const email = Joi.string().trim().lowercase().email().max(120);
const phone = Joi.string().trim().max(32);

// -------- Schemas --------

// GET /users  (list + filter)
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(20),
    q: Joi.string().trim().allow('', null),               // search theo name/username
    role: Joi.string().valid(...ROLES).optional(),
    active: Joi.boolean().optional(),

    // sort: 'createdAt' | '-createdAt' | 'name' | '-name' | 'username' | 'role' | 'active'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(createdAt|name|username|role|active)$/)
      .default('-createdAt'),
  }),
};

// POST /users  (admin tạo user mới)
module.exports.create = {
  body: Joi.object({
    username: username.required(),
    password: password.required(),
    name: Joi.string().trim().max(120).optional(),
    email: email.allow('', null).optional(),
    phone: phone.allow('', null).optional(),
    avatar: Joi.string().trim().uri().allow('', null).optional(),
    role: Joi.string().valid(...ROLES).default('staff'),
    active: Joi.boolean().default(true),
  }),
};

// PUT /users/:id  (admin cập nhật người dùng)
module.exports.update = {
  params: Joi.object({
    id: objectId().required(),
  }),
  body: Joi.object({
    name: Joi.string().trim().max(120),
    email: email.allow('', null),
    phone: phone.allow('', null),
    avatar: Joi.string().trim().uri().allow('', null),
    role: Joi.string().valid(...ROLES),
    active: Joi.boolean(),
    // Không cho cập nhật username/password ở đây (tách endpoint riêng nếu cần)
  }).min(1),
};

// PATCH /users/:id/role
module.exports.changeRole = {
  params: Joi.object({
    id: objectId().required(),
  }),
  body: Joi.object({
    role: Joi.string().valid(...ROLES).required(),
  }),
};

// PATCH /users/:id/active
module.exports.setActive = {
  params: Joi.object({
    id: objectId().required(),
  }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// (Tùy chọn) PATCH /users/:id/reset-password  — chỉ admin
module.exports.resetPassword = {
  params: Joi.object({
    id: objectId().required(),
  }),
  body: Joi.object({
    newPassword: password.required(),
    confirmNewPassword: Joi.any().valid(Joi.ref('newPassword')).required()
      .messages({ 'any.only': 'Xác nhận mật khẩu không khớp' }),
  }),
};

// GET /users/:id
module.exports.getOne = {
  params: Joi.object({
    id: objectId().required(),
  }),
};

module.exports.objectId = objectId;
module.exports.ROLES = ROLES;
