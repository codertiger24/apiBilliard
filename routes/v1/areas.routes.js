// routes/v1/areas.routes.js
const router = require('express').Router();

const ctrl = require('../../controllers/area.controller');
const { validate } = require('../../middlewares/validate.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireAdmin } = require('../../middlewares/role.middleware');
const schema = require('../../validators/area.schema');

// Yêu cầu đăng nhập cho tất cả endpoint
router.use(requireAuth);

// Public cho user đăng nhập: xem danh sách / chi tiết
// GET /api/v1/areas
router.get('/', validate(schema.list), ctrl.list);

// GET /api/v1/areas/:id
router.get('/:id', validate(schema.getOne), ctrl.getOne);

// Admin-only: tạo / sửa / kích hoạt / sắp xếp / xoá

// POST /api/v1/areas
router.post('/', requireAdmin, validate(schema.create), ctrl.create);

// PUT /api/v1/areas/:id
router.put('/:id', requireAdmin, validate(schema.update), ctrl.update);

// PATCH /api/v1/areas/:id/active
router.patch('/:id/active', requireAdmin, validate(schema.setActive), ctrl.setActive);

// PATCH /api/v1/areas/reorder
router.patch('/reorder', requireAdmin, validate(schema.reorder), ctrl.reorder);

// DELETE /api/v1/areas/:id
router.delete('/:id', requireAdmin, validate(schema.remove), ctrl.remove);

module.exports = router;
