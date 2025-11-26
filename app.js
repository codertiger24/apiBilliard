// app.js
try {
  require('dotenv').config();
} catch {}

const createError = require('http-errors');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const hbs = require('hbs');
const db = require('./config/db');
const { requestId, httpLogger } = require('./utils/logger');

/* -------------------------------------------------------------------------- */
/*                              1) Kết nối DB                                 */
/* -------------------------------------------------------------------------- */
db.connect();

/* -------------------------------------------------------------------------- */
/*                              2) Khởi tạo App                               */
/* -------------------------------------------------------------------------- */
const app = express();

// Trust proxy (để đọc IP thật khi sau Nginx/Cloudflare)
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY);
} else {
  app.set('trust proxy', 1);
}

// Bảo vệ lộ thông tin stack/tooling
app.disable('x-powered-by');

/* -------------------------------------------------------------------------- */
/*                           View engine (Handlebars)                         */
/* -------------------------------------------------------------------------- */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Partials + Helpers
try {
  hbs.registerPartials(path.join(__dirname, 'views', 'partials'));
} catch {}

hbs.registerHelper('eq', (a, b) => String(a) === String(b));
hbs.registerHelper('json', (v) => JSON.stringify(v));
hbs.registerHelper('money', (n) => {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(Number(n || 0));
  } catch {
    return Number(n || 0).toFixed(0);
  }
});
hbs.registerHelper('datetime', (d) =>
  (d ? new Date(d) : new Date()).toLocaleString('vi-VN')
);

/* -------------------------------------------------------------------------- */
/*                    Optional middlewares (auto-enable)                      */
/* -------------------------------------------------------------------------- */
let helmet = null;
let compression = null;
let cors = null;

try {
  helmet = require('helmet');
} catch {}
try {
  compression = require('compression');
} catch {}
try {
  cors = require('cors');
} catch {}

if (helmet) {
  // Bật các header bảo mật cơ bản
  app.use(helmet());
}

if (compression) {
  app.use(compression());
}

// CORS (nếu có lib)
if (cors) {
  const origins = (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isWildcard = origins.includes('*');
  const corsOpts = isWildcard
    ? { origin: true, credentials: true }
    : { origin: origins, credentials: true };

  // Cho phép các header thường dùng khi gửi JWT qua header/cookie
  corsOpts.allowedHeaders = [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-Id',
  ];
  corsOpts.exposedHeaders = ['X-Request-Id'];

  app.use(cors(corsOpts));
  // Xử lý preflight cho mọi route
  app.options('*', cors(corsOpts));
}

/* -------------------------------------------------------------------------- */
/*                              Core middlewares                              */
/* -------------------------------------------------------------------------- */
app.use(requestId); // gắn req.id & X-Request-Id
app.use(httpLogger()); // access log

app.use(
  express.json({
    limit: process.env.JSON_LIMIT || '2mb',
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'public', 'uploads'))
);
app.use(express.static(path.join(__dirname, 'public')));

// Inject locals mặc định cho views
app.use((req, res, next) => {
  res.locals.appName = process.env.APP_NAME || 'Billiard POS';
  res.locals.year = new Date().getFullYear();
  res.locals.requestId = req.id || null;
  res.locals.user = req.user || null; // sẽ là null nếu không có middleware auth ở web routes
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
/* -------------------------------------------------------------------------- */
/*                                Web routes                                  */
/* -------------------------------------------------------------------------- */
let webRouterMod = null;
try {
  webRouterMod = require('./routes/index');
} catch {}

const pickRouter = (mod) => {
  if (!mod) return null;
  if (typeof mod === 'function') return mod; // module.exports = router
  if (typeof mod.default === 'function') return mod.default; // export default router
  if (typeof mod.router === 'function') return mod.router; // module.exports = { router }
  return null;
};

const webRouter = pickRouter(webRouterMod);
if (webRouter) {
  app.use('/', webRouter);
}

/* -------------------------------------------------------------------------- */
/*                                 API v1                                     */
/* -------------------------------------------------------------------------- */
let v1Mod = null;
try {
  v1Mod = require('./routes/v1');
} catch (e) {
  console.error('[app] Cannot load routes/v1:', e && e.message);
}

const apiV1 = pickRouter(v1Mod);

if (!apiV1) {
  console.error(
    '[app] Invalid export from routes/v1. Expect a Router/function. Got:',
    typeof v1Mod,
    v1Mod && Object.keys(v1Mod)
  );
} else {
  app.use('/api/v1', apiV1);
}

/* -------------------------------------------------------------------------- */
/*                        Not found & Error handling                          */
/* -------------------------------------------------------------------------- */

// 1) Cho API: nếu có middleware riêng, mount ở prefix /api
let apiNotFound = null;
let apiError = null;

try {
  // notfound.middleware.js export { apiNotFound, webNotFound, autoNotFound }
  ({ apiNotFound } = require('./middlewares/notfound.middleware'));
} catch {}

try {
  apiError = require('./middlewares/error.middleware');
} catch {}

if (typeof apiNotFound === 'function') {
  app.use('/api', apiNotFound);
}
if (typeof apiError === 'function') {
  app.use('/api', apiError);
}

// 2) 404 còn lại
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    return next(createError(404, 'API route not found'));
  }
  return next(createError(404));
});

// 3) Error fallback (web + api)
app.use((err, req, res, _next) => {
  // Gắn requestId vào response để debug
  if (!res.headersSent && req.id) {
    res.setHeader('X-Request-Id', req.id);
  }

  if (req.originalUrl.startsWith('/api/')) {
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({
      status,
      message: err.message || 'Internal Server Error',
      requestId: req.id || null,
    });
  }

  res.status(err.status || 500);
  res.render('error', {
    title: 'Lỗi',
    message: err.message,
    error: req.app.get('env') === 'development' ? err : {},
    requestId: req.id || null,
    year: new Date().getFullYear(),
    appName: process.env.APP_NAME || 'Billiard POS',
  });
});

/* -------------------------------------------------------------------------- */
/*                       Optional: lịch backup (cron)                         */
/* -------------------------------------------------------------------------- */
if (process.env.ENABLE_BACKUP_SCHEDULE === 'true') {
  try {
    const { scheduleBackup } = require('./jobs/backup.job');
    if (typeof scheduleBackup === 'function') {
      scheduleBackup();
    }
  } catch {
    // bỏ qua nếu chưa có module/dep
  }
}

module.exports = app;
