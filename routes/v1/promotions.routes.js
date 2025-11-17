// routes/v1/promotions.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/promotion.controller');
const schema = require('../../validators/promotion.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');

/* -------------------------------------------------------------------------- */
/*                      Admin-only: Promotion management                      */
/* -------------------------------------------------------------------------- */
// Tất cả route phía dưới yêu cầu admin đã đăng nhập
router.use(requireAuth, requireAdmin);

// GET /api/v1/promotions
router.get(
  '/promotions',
  validate(schema.list),
  ctrl.list
);

// GET /api/v1/promotions/:id
router.get(
  '/promotions/:id',
  validate(schema.getOne),
  ctrl.getOne
);

// POST /api/v1/promotions
router.post(
  '/promotions',
  validate(schema.create),
  ctrl.create
);

// PUT /api/v1/promotions/:id
router.put(
  '/promotions/:id',
  validate(schema.update),
  ctrl.update
);

// PATCH /api/v1/promotions/:id/active
router.patch(
  '/promotions/:id/active',
  validate(schema.setActive),
  ctrl.setActive
);

// PATCH /api/v1/promotions/:id/apply-order
router.patch(
  '/promotions/:id/apply-order',
  validate(schema.setApplyOrder),
  ctrl.setApplyOrder
);

// DELETE /api/v1/promotions/:id
router.delete(
  '/promotions/:id',
  validate(schema.remove),
  ctrl.remove
);

module.exports = router;
