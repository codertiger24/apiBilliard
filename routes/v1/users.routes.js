// routes/v1/users.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user.controller');
const schema = require('../../validators/user.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

/**
 * User management (Admin only)
 * Tất cả route phía dưới đều yêu cầu admin đã đăng nhập.
 */
router.use(requireAuth, requireAdmin);

// GET /api/v1/users
router.get(
  '/users',
  validate(schema.list),
  ctrl.list
);

// GET /api/v1/users/:id
router.get(
  '/users/:id',
  validate(schema.getOne),
  ctrl.getOne
);

// POST /api/v1/users
router.post(
  '/users',
  validate(schema.create),
  ctrl.create
);

// PUT /api/v1/users/:id
router.put(
  '/users/:id',
  validate(schema.update),
  ctrl.update
);

// PATCH /api/v1/users/:id/role
router.patch(
  '/users/:id/role',
  validate(schema.changeRole),
  ctrl.changeRole
);

// PATCH /api/v1/users/:id/active
router.patch(
  '/users/:id/active',
  validate(schema.setActive),
  ctrl.setActive
);

// PATCH /api/v1/users/:id/reset-password
router.patch(
  '/users/:id/reset-password',
  validate(schema.resetPassword),
  ctrl.resetPassword
);

// DELETE /api/v1/users/:id
router.delete(
  '/users/:id',
  validate(schema.remove),
  ctrl.remove
);

module.exports = router;
