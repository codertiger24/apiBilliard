// routes/v1/index.js
const express = require('express');
const router = express.Router();

// Thông tin package (dùng cho /version; nếu lỗi thì dùng giá trị mặc định)
let pkg = { name: 'apiBiliard', version: '0.0.0' };
try {
  // eslint-disable-next-line global-require
  pkg = require('../../package.json');
} catch (e) {
  // ignore nếu không đọc được package.json
}

/* -------------------------------------------------------------------------- */
/*                          Healthcheck / Version                             */
/* -------------------------------------------------------------------------- */

// GET /api/v1/health
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/v1/version
router.get('/version', (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    node: process.version,
    env: process.env.NODE_ENV || 'development',
  });
});

/* -------------------------------------------------------------------------- */
/*                                Sub-routes                                  */
/* -------------------------------------------------------------------------- */
/**
 * Mỗi file *.routes.js export ra 1 express.Router()
 * Bên trong đã khai báo path đầy đủ: /auth/login, /users, /tables...
 */

const authRoutes = require('./auth.routes');
const userRoutes = require('./users.routes');
const tableRoutes = require('./tables.routes');
const sessionRoutes = require('./sessions.routes');
const productRoutes = require('./products.routes');
const categoryRoutes = require('./categories.routes');
const billRoutes = require('./bills.routes');
const promotionRoutes = require('./promotions.routes');
const reportRoutes = require('./reports.routes');
const settingRoutes = require('./settings.routes');
const areaRoutes = require('./areas.routes');

// Mount lần lượt
router.use(authRoutes);
router.use(userRoutes);
router.use(tableRoutes);
router.use(sessionRoutes);
router.use(productRoutes);
router.use(categoryRoutes);
router.use(billRoutes);
router.use(promotionRoutes);
router.use(reportRoutes);
router.use(settingRoutes);

// Areas: trong areas.routes.js path là '/', '/:id'
// nên mount với prefix '/areas'
router.use('/areas', areaRoutes);

module.exports = router;
