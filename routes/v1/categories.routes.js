// routes/v1/categories.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/category.controller');
const schema = require('../../validators/category.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

/* ----------------------------- Admin-only: Category management ----------------------------- */
// Tất cả route phía dưới đều yêu cầu admin đã đăng nhập
router.use(requireAuth, requireAdmin);

// GET /api/v1/categories
router.get(
  '/categories',
  validate(schema.list),
  ctrl.list
);

// GET /api/v1/categories/:id
router.get(
  '/categories/:id',
  validate(schema.getOne),
  ctrl.getOne
);

// POST /api/v1/categories
router.post(
  '/categories',
  validate(schema.create),
  ctrl.create
);

// PUT /api/v1/categories/:id
router.put(
  '/categories/:id',
  validate(schema.update),
  ctrl.update
);

// PATCH /api/v1/categories/:id/active
router.patch(
  '/categories/:id/active',
  validate(schema.setActive),
  ctrl.setActive
);

// DELETE /api/v1/categories/:id
router.delete(
  '/categories/:id',
  validate(schema.remove),
  ctrl.remove
);

module.exports = router;
