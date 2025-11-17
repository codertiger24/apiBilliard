// routes/v1/sessions.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/session.controller');
const schema = require('../../validators/session.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

/* -------------------------------------------------------------------------- */
/*                 Nhân viên & quản lý được thao tác nghiệp vụ phiên          */
/* -------------------------------------------------------------------------- */

router.use(requireAuth, requireRole(['staff', 'admin']));

/* -------------------------- Danh sách & chi tiết -------------------------- */
// GET /api/v1/sessions
router.get('/sessions', validate(schema.list), ctrl.list);

// GET /api/v1/sessions/:id
router.get('/sessions/:id', validate(schema.getOne), ctrl.getOne);

/* ----------------------------- Check-in (mở phiên) ----------------------------- */
// POST /api/v1/sessions
router.post('/sessions', validate(schema.open), ctrl.open);

/* --------------------------- Dịch vụ trong phiên --------------------------- */
// POST /api/v1/sessions/:id/items
router.post('/sessions/:id/items', validate(schema.addItem), ctrl.addItem);

// PATCH /api/v1/sessions/:id/items/:itemId
router.patch(
  '/sessions/:id/items/:itemId',
  validate(schema.updateItemQty),
  ctrl.updateItemQty
);

// DELETE /api/v1/sessions/:id/items/:itemId
router.delete(
  '/sessions/:id/items/:itemId',
  validate(schema.removeItem),
  ctrl.removeItem
);

/* ----------------------------- Tạm tính & checkout ----------------------------- */
// GET /api/v1/sessions/:id/preview-close
router.get(
  '/sessions/:id/preview-close',
  validate(schema.previewClose),
  ctrl.previewClose
);

// POST /api/v1/sessions/:id/checkout
router.post(
  '/sessions/:id/checkout',
  validate(schema.checkout),
  ctrl.checkout
);

/* ------------------------------- Huỷ phiên ------------------------------- */
// PATCH /api/v1/sessions/:id/void
router.patch('/sessions/:id/void', validate(schema.void), ctrl.void);

module.exports = router;
