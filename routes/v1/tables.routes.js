// routes/v1/tables.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/table.controller');
const schema = require('../../validators/table.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

/* -------------------------------------------------------------------------- */
/*                           Staff & Admin: view tables                        */
/* -------------------------------------------------------------------------- */

// GET /api/v1/tables
router.get(
  '/tables',
  requireAuth,
  requireRole(['staff', 'admin']),
  validate(schema.list),
  ctrl.list
);

// GET /api/v1/tables/:id
router.get(
  '/tables/:id',
  requireAuth,
  requireRole(['staff', 'admin']),
  validate(schema.getOne),
  ctrl.getOne
);

/* -------------------------------------------------------------------------- */
/*                               Admin: CRUD & actions                        */
/* -------------------------------------------------------------------------- */

// POST /api/v1/tables
router.post(
  '/tables',
  requireAuth,
  requireAdmin,
  validate(schema.create),
  ctrl.create
);

// PUT /api/v1/tables/:id
router.put(
  '/tables/:id',
  requireAuth,
  requireAdmin,
  validate(schema.update),
  ctrl.update
);

// PATCH /api/v1/tables/:id/status
router.patch(
  '/tables/:id/status',
  requireAuth,
  requireAdmin,
  validate(schema.changeStatus),
  ctrl.changeStatus
);

// PATCH /api/v1/tables/:id/active
router.patch(
  '/tables/:id/active',
  requireAuth,
  requireAdmin,
  validate(schema.setActive),
  ctrl.setActive
);

// PATCH /api/v1/tables/:id/rate
router.patch(
  '/tables/:id/rate',
  requireAuth,
  requireAdmin,
  validate(schema.setRate),
  ctrl.setRate
);

// PATCH /api/v1/tables/reorder
// (Đặt trước mọi route PATCH /tables/:id khác trong tương lai)
router.patch(
  '/tables/reorder',
  requireAuth,
  requireAdmin,
  validate(schema.reorder),
  ctrl.reorder
);

// DELETE /api/v1/tables/:id
router.delete(
  '/tables/:id',
  requireAuth,
  requireAdmin,
  validate(schema.remove),
  ctrl.remove
);

module.exports = router;
