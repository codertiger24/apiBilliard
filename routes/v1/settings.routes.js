// routes/v1/settings.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/setting.controller');
const schema = require('../../validators/setting.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

/**
 * Settings routes
 * - Staff/Admin: read-effective & read-current
 * - Admin: upsert + sectioned updates + admin utilities
 */

/* -------------------------------------------------------------------------- */
/*                     Staff & Admin: read-only settings                      */
/* -------------------------------------------------------------------------- */

// GET /api/v1/settings/effective
router.get(
  '/settings/effective',
  requireAuth,
  requireRole(['staff', 'admin']),
  ctrl.getEffective
);

// GET /api/v1/settings
router.get(
  '/settings',
  requireAuth,
  requireRole(['staff', 'admin']),
  validate(schema.getCurrent),
  ctrl.getCurrent
);

/* -------------------------------------------------------------------------- */
/*                        Admin only: write operations                        */
/* -------------------------------------------------------------------------- */

// PUT /api/v1/settings
router.put(
  '/settings',
  requireAuth,
  requireAdmin,
  validate(schema.upsert),
  ctrl.upsert
);

// PATCH /api/v1/settings/shop
router.patch(
  '/settings/shop',
  requireAuth,
  requireAdmin,
  validate(schema.setShop),
  ctrl.setShop
);

// PATCH /api/v1/settings/billing
router.patch(
  '/settings/billing',
  requireAuth,
  requireAdmin,
  validate(schema.setBilling),
  ctrl.setBilling
);

// PATCH /api/v1/settings/print
router.patch(
  '/settings/print',
  requireAuth,
  requireAdmin,
  validate(schema.setPrint),
  ctrl.setPrint
);

// PATCH /api/v1/settings/e-receipt
router.patch(
  '/settings/e-receipt',
  requireAuth,
  requireAdmin,
  validate(schema.setEReceipt),
  ctrl.setEReceipt
);

// PATCH /api/v1/settings/backup
router.patch(
  '/settings/backup',
  requireAuth,
  requireAdmin,
  validate(schema.setBackup),
  ctrl.setBackup
);

/* -------------------------------------------------------------------------- */
/*                         Admin utilities (optional)                         */
/* -------------------------------------------------------------------------- */

// GET /api/v1/settings/all
router.get(
  '/settings/all',
  requireAuth,
  requireAdmin,
  ctrl.listAll
);

// GET /api/v1/settings/:id
router.get(
  '/settings/:id',
  requireAuth,
  requireAdmin,
  validate(schema.getById), // ensure :id is a valid ObjectId
  ctrl.getById
);

// DELETE /api/v1/settings/:id
router.delete(
  '/settings/:id',
  requireAuth,
  requireAdmin,
  validate(schema.remove), // ensure :id is a valid ObjectId
  ctrl.remove
);

module.exports = router;
