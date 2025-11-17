// routes/v1/products.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/product.controller');
const schema = require('../../validators/product.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole, requireAdmin } = require('../../middlewares/role.middleware');

/* -------------------------------------------------------------------------- */
/*                     Staff & Admin: Read-only access                        */
/* -------------------------------------------------------------------------- */

// GET /api/v1/products
router.get(
  '/products',
  requireAuth,
  requireRole(['staff', 'admin']),
  validate(schema.list),
  ctrl.list
);

// GET /api/v1/products/:id
router.get(
  '/products/:id',
  requireAuth,
  requireRole(['staff', 'admin']),
  validate(schema.getOne),
  ctrl.getOne
);

/* -------------------------------------------------------------------------- */
/*                        Admin: CRUD & product actions                       */
/* -------------------------------------------------------------------------- */

// POST /api/v1/products
router.post(
  '/products',
  requireAuth,
  requireAdmin,
  validate(schema.create),
  ctrl.create
);

// PUT /api/v1/products/:id
router.put(
  '/products/:id',
  requireAuth,
  requireAdmin,
  validate(schema.update),
  ctrl.update
);

// PATCH /api/v1/products/:id/active
router.patch(
  '/products/:id/active',
  requireAuth,
  requireAdmin,
  validate(schema.setActive),
  ctrl.setActive
);

// PATCH /api/v1/products/:id/price
router.patch(
  '/products/:id/price',
  requireAuth,
  requireAdmin,
  validate(schema.setPrice),
  ctrl.setPrice
);

// PATCH /api/v1/products/:id/images
router.patch(
  '/products/:id/images',
  requireAuth,
  requireAdmin,
  validate(schema.setImages),
  ctrl.setImages
);

// PATCH /api/v1/products/:id/tags/add
router.patch(
  '/products/:id/tags/add',
  requireAuth,
  requireAdmin,
  validate(schema.addTags),
  ctrl.addTags
);

// PATCH /api/v1/products/:id/tags/remove
router.patch(
  '/products/:id/tags/remove',
  requireAuth,
  requireAdmin,
  validate(schema.removeTags),
  ctrl.removeTags
);

// DELETE /api/v1/products/:id
router.delete(
  '/products/:id',
  requireAuth,
  requireAdmin,
  validate(schema.remove),
  ctrl.remove
);

module.exports = router;
