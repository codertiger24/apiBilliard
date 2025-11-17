// controllers/setting.controller.js
const R = require('../utils/response');
const Setting = require('../models/setting.model');

function safeRequire(p) { try { return require(p); } catch { return null; } }
const Billing = safeRequire('../services/billing.service'); // optional service
const getActiveSetting = Billing?.getActiveSetting;

/* ======================== helpers ======================== */
function sanitize(doc) {
  if (!doc) return doc;
  return doc.toJSON ? doc.toJSON() : doc;
}

function normalizeScope(v) {
  const s = String(v || '').toLowerCase();
  return s === 'branch' ? 'branch' : 'global';
}

/** Pick scope/branch from query or body, default to global */
function pickScope(req) {
  const scope = normalizeScope(req.query.scope || req.body.scope || 'global');
  const branchId = req.query.branchId || req.body.branchId || null;
  return { scope, branchId };
}

async function findSetting(scope = 'global', branchId = null) {
  const q = scope === 'branch'
    ? { scope: 'branch', branchId: branchId || null }
    : { scope: 'global' };
  return Setting.findOne(q);
}

/** Ensure a setting document exists for the given scope/branch. */
async function ensureSetting(scope = 'global', branchId = null, { createdBy, updatedBy } = {}) {
  const existed = await findSetting(scope, branchId);
  if (existed) return existed;

  const payload = {
    scope: scope === 'branch' ? 'branch' : 'global',
    branchId: scope === 'branch' ? (branchId || null) : null,
    createdBy: createdBy || null,
    updatedBy: updatedBy || null,
  };
  return Setting.create(payload);
}

/* ======================== controllers ======================== */

/**
 * GET /settings
 * ?scope=global|branch&branchId=...
 * Returns the explicit record for the requested scope. Does NOT auto-create.
 */
exports.getCurrent = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);

  if (scope === 'branch' && !branchId) {
    return R.fail(res, 400, 'branchId is required for scope=branch');
  }

  const doc = await findSetting(scope, branchId);
  return R.ok(res, doc ? sanitize(doc) : null);
});

/**
 * GET /settings/effective?branchId=...
 * Returns the effective configuration (branch override if present, otherwise global).
 * If a Billing service exposes getActiveSetting, prefer it for consistency with billing rules.
 */
exports.getEffective = R.asyncHandler(async (req, res) => {
  const branchId = req.query.branchId || null;

  if (typeof getActiveSetting === 'function') {
    const cfg = await getActiveSetting(branchId || null);
    return R.ok(res, cfg || null);
  }

  // Fallback: use branch-specific first, then global
  let doc = null;
  if (branchId) doc = await Setting.findOne({ scope: 'branch', branchId: branchId || null });
  if (!doc) doc = await Setting.findOne({ scope: 'global' });

  return R.ok(res, doc ? sanitize(doc) : null);
});

/**
 * PUT /settings
 * Body: { scope, branchId?, shop, billing, print, eReceipt, backup }
 * Upserts the full configuration block for the given scope.
 */
exports.upsert = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) {
    return R.fail(res, 400, 'branchId is required for scope=branch');
  }

  const actorId = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy: actorId, updatedBy: actorId });

  // Overwrite blocks atomically according to validated payload (validators/setting.schema.js)
  const { shop, billing, print, eReceipt, backup } = req.body;
  if (typeof shop !== 'undefined')   { doc.shop = shop; doc.markModified?.('shop'); }
  if (typeof billing !== 'undefined'){ doc.billing = billing; doc.markModified?.('billing'); }
  if (typeof print !== 'undefined')  { doc.print = print; doc.markModified?.('print'); }
  if (typeof eReceipt !== 'undefined'){ doc.eReceipt = eReceipt; doc.markModified?.('eReceipt'); }
  if (typeof backup !== 'undefined') { doc.backup = backup; doc.markModified?.('backup'); }

  doc.updatedBy = actorId;
  await doc.save();

  return R.ok(res, sanitize(doc), 'Settings upserted');
});

/**
 * PATCH /settings/shop[?scope=&branchId=]
 */
exports.setShop = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required for scope=branch');

  const actorId = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy: actorId, updatedBy: actorId });

  doc.shop = req.body;
  doc.markModified?.('shop');
  doc.updatedBy = actorId;
  await doc.save();

  return R.ok(res, sanitize(doc), 'Shop settings updated');
});

/**
 * PATCH /settings/billing[?scope=&branchId=]
 */
exports.setBilling = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required for scope=branch');

  const actorId = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy: actorId, updatedBy: actorId });

  doc.billing = req.body;
  doc.markModified?.('billing');
  doc.updatedBy = actorId;
  await doc.save();

  return R.ok(res, sanitize(doc), 'Billing settings updated');
});

/**
 * PATCH /settings/print[?scope=&branchId=]
 */
exports.setPrint = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required for scope=branch');

  const actorId = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy: actorId, updatedBy: actorId });

  doc.print = req.body;
  doc.markModified?.('print');
  doc.updatedBy = actorId;
  await doc.save();

  return R.ok(res, sanitize(doc), 'Print settings updated');
});

/**
 * PATCH /settings/e-receipt[?scope=&branchId=]
 */
exports.setEReceipt = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required for scope=branch');

  const actorId = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy: actorId, updatedBy: actorId });

  doc.eReceipt = req.body;
  doc.markModified?.('eReceipt');
  doc.updatedBy = actorId;
  await doc.save();

  return R.ok(res, sanitize(doc), 'E-receipt settings updated');
});

/**
 * PATCH /settings/backup[?scope=&branchId=]
 */
exports.setBackup = R.asyncHandler(async (req, res) => {
  const { scope, branchId } = pickScope(req);
  if (scope === 'branch' && !branchId) return R.fail(res, 400, 'branchId is required for scope=branch');

  const actorId = req.user?._id || null;
  const doc = await ensureSetting(scope, branchId, { createdBy: actorId, updatedBy: actorId });

  doc.backup = req.body;
  doc.markModified?.('backup');
  doc.updatedBy = actorId;
  await doc.save();

  return R.ok(res, sanitize(doc), 'Backup settings updated');
});

/* ======================== admin utils (optional) ======================== */

/** GET /settings/all — list all records for admin */
exports.listAll = R.asyncHandler(async (_req, res) => {
  const items = await Setting.find().sort({ scope: 1, branchId: 1, updatedAt: -1 });
  return R.ok(res, items.map(sanitize));
});

/** GET /settings/:id */
exports.getById = R.asyncHandler(async (req, res) => {
  const doc = await Setting.findById(req.params.id);
  if (!doc) return R.fail(res, 404, 'Setting not found');
  return R.ok(res, sanitize(doc));
});

/** DELETE /settings/:id */
exports.remove = R.asyncHandler(async (req, res) => {
  const doc = await Setting.findByIdAndDelete(req.params.id);
  if (!doc) return R.fail(res, 404, 'Setting not found');
  return R.noContent(res);
});
