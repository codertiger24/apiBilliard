// routes/v1/reports.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/report.controller');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

/**
 * Reports — staff & admin access
 * Tất cả endpoint phía dưới yêu cầu đăng nhập với role: staff | admin
 */
router.use(requireAuth, requireRole(['staff', 'admin']));

// GET /api/v1/reports/summary
// Tổng quan trong khoảng thời gian
router.get('/reports/summary', ctrl.summary);

// GET /api/v1/reports/daily
// Báo cáo theo 1 ngày
router.get('/reports/daily', ctrl.daily);

// GET /api/v1/reports/revenue
// Time series doanh thu (groupBy=day|month)
router.get('/reports/revenue', ctrl.revenue);

// GET /api/v1/reports/top-products
// Top sản phẩm (by qty|amount)
router.get('/reports/top-products', ctrl.topProducts);

// GET /api/v1/reports/top-tables
// Top bàn (by minutes|amount)
router.get('/reports/top-tables', ctrl.topTables);

// GET /api/v1/reports/staff
// Doanh thu theo nhân viên
router.get('/reports/staff', ctrl.byStaff);

// GET /api/v1/reports/dashboard
// Snapshot dashboard (hôm nay)
router.get('/reports/dashboard', ctrl.dashboard);

module.exports = router;
