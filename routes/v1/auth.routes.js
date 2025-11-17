// routes/v1/auth.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/auth.controller');
const schema = require('../../validators/auth.schema');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth, verifyRefresh } = require('../../middlewares/auth.middleware');

// ---- Public auth endpoints ----

// POST /api/v1/auth/login
router.post('/auth/login', validate(schema.login), ctrl.login);

// POST /api/v1/auth/refresh
router.post('/auth/refresh', validate(schema.refresh), verifyRefresh, ctrl.refresh);

// POST /api/v1/auth/logout
router.post('/auth/logout', ctrl.logout);

// ---- Authenticated profile endpoints ----

// GET /api/v1/auth/me
router.get('/auth/me', requireAuth, ctrl.me);

// PUT /api/v1/auth/profile
router.put(
  '/auth/profile',
  requireAuth,
  validate(schema.updateProfile),
  ctrl.updateProfile
);

// PUT /api/v1/auth/change-password
router.put(
  '/auth/change-password',
  requireAuth,
  validate(schema.changePassword),
  ctrl.changePassword
);

module.exports = router;
