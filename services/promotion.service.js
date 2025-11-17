// services/promotion.service.js
const mongoose = require('mongoose');
const Promotion = require('../models/promotion.model');
const Product = require('../models/product.model');
const Table = require('../models/table.model');

/* ========================= Time helpers ========================= */
function hhmm(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function hhmmToMinutes(s) {
  const [h, m] = (s || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}
function inTimeRange(cur, from, to) {
  // Hỗ trợ qua đêm (from > to)
  const c = hhmmToMinutes(cur);
  const f = hhmmToMinutes(from);
  const t = hhmmToMinutes(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return true;
  if (f <= t) return c >= f && c <= t;
  return c >= f || c <= t;
}

/* ========================= Math helpers ========================= */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function roundVND(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

/* ========================= Load promotions ========================= */
/**
 * Lấy danh sách khuyến mãi đang kích hoạt theo chi nhánh & thời điểm.
 * - Bao gồm cả khuyến mãi toàn hệ thống (branchId=null) khi truyền branchId cụ thể.
 * - Lọc coarse theo validFrom/validTo ở DB; các điều kiện khác kiểm trong code.
 */
async function getActivePromotions({ branchId = null, at = new Date() } = {}) {
  const timeAnd = [
    // validFrom: null hoặc <= at
    {
      $or: [
        { 'timeRule.validFrom': null },
        { 'timeRule.validFrom': { $exists: false } },
        { 'timeRule.validFrom': { $lte: at } },
      ],
    },
    // validTo: null hoặc >= at (tính theo cuối ngày)
    {
      $or: [
        { 'timeRule.validTo': null },
        { 'timeRule.validTo': { $exists: false } },
        { 'timeRule.validTo': { $gte: at } },
      ],
    },
  ];

  const q = { active: true, $and: timeAnd };
  if (branchId) {
    // Lấy cả global (null) lẫn KM theo nhánh
    q.branchId = { $in: [branchId, null] };
  } else {
    q.branchId = null;
  }

  return Promotion.find(q)
    .sort({ applyOrder: 1, createdAt: 1 })
    .lean();
}

/* ========================= Evaluate gates ========================= */
function promoIsActiveAt(promo, at = new Date()) {
  // Dự phòng trường hợp .lean() không có method
  const tr = promo.timeRule || {};
  const { validFrom, validTo, daysOfWeek = [], timeRanges = [] } = tr;

  const now = new Date(at);

  if (validFrom && now < new Date(validFrom)) return false;
  if (validTo) {
    const end = new Date(validTo);
    end.setHours(23, 59, 59, 999);
    if (now > end) return false;
  }

  if (Array.isArray(daysOfWeek) && daysOfWeek.length) {
    const dow = now.getDay();
    if (!daysOfWeek.includes(dow)) return false;
  }

  if (Array.isArray(timeRanges) && timeRanges.length) {
    const cur = hhmm(now);
    const hit = timeRanges.some(r => r?.from && r?.to && inTimeRange(cur, r.from, r.to));
    if (!hit) return false;
  }
  return true;
}

function includesObjectId(arr, id) {
  if (!id) return false;
  const s = String(id);
  return (arr || []).some(x => String(x) === s);
}

/* ========================= Base amounts ========================= */
/**
 * baseAmounts giữ "phần còn lại có thể giảm" cho từng mục tiêu:
 *   - playRemaining, serviceRemaining, billRemaining (bắt đầu = giá trị gốc)
 * Mỗi khuyến mãi giảm xong sẽ trừ vào remaining tương ứng để tránh giảm quá.
 */
function buildBaseAmounts({ playAmount = 0, serviceAmount = 0, subTotal = 0 }) {
  return {
    playRemaining: roundVND(playAmount),
    serviceRemaining: roundVND(serviceAmount),
    billRemaining: roundVND(subTotal),
  };
}

function pickTargetBase(remaining, applyTo) {
  if (applyTo === 'play') return remaining.playRemaining;
  if (applyTo === 'service') return remaining.serviceRemaining;
  return remaining.billRemaining; // 'bill'
}

function deductTargetBase(remaining, applyTo, amount) {
  if (applyTo === 'play') {
    remaining.playRemaining = clamp(remaining.playRemaining - amount, 0, Infinity);
  } else if (applyTo === 'service') {
    remaining.serviceRemaining = clamp(remaining.serviceRemaining - amount, 0, Infinity);
  } else {
    remaining.billRemaining = clamp(remaining.billRemaining - amount, 0, Infinity);
  }
}

/* ========================= Product helpers ========================= */
/**
 * Chuẩn hoá danh sách item dịch vụ để dùng cho scope=product:
 * [{ productId, categoryId, price, qty, amount }]
 * - Nếu thiếu categoryId sẽ truy vấn Product để gắn.
 */
async function normalizeServiceItems(serviceItems) {
  if (!Array.isArray(serviceItems) || !serviceItems.length) return [];
  const needs = serviceItems
    .filter(it => !it.categoryId && it.productId)
    .map(it => it.productId);

  let catMap = {};
  if (needs.length) {
    const docs = await Product.find({ _id: { $in: needs } })
      .select('_id category')
      .lean();
    catMap = Object.fromEntries(docs.map(d => [String(d._id), String(d.category)]));
  }

  return serviceItems.map(it => ({
    productId: it.productId ? String(it.productId) : null,
    categoryId: it.categoryId
      ? String(it.categoryId)
      : (it.productId ? catMap[String(it.productId)] || null : null),
    price: Number(it.price || it.priceSnapshot || 0),
    qty: Number(it.qty || 0),
    amount: roundVND(
      it.amount != null
        ? it.amount
        : (Number(it.price || it.priceSnapshot || 0) * Number(it.qty || 0))
    ),
  }));
}

/** Tổng tiền các item phù hợp theo rule */
function sumEligibleProductAmount(items, productRule) {
  if (!productRule) return 0;
  const allowCats = (productRule.categories || []).map(String);
  const allowProds = (productRule.products || []).map(String);

  const eligible = items.filter(it => {
    const okProd = !allowProds.length || allowProds.includes(it.productId);
    const okCat = !allowCats.length || allowCats.includes(it.categoryId);
    return okProd && okCat;
  });

  // Combo (đơn giản): nếu có định nghĩa combo, yêu cầu mỗi sản phẩm đạt min qty
  if (Array.isArray(productRule.combo) && productRule.combo.length) {
    const okCombo = productRule.combo.every(c => {
      const found = eligible.find(it => it.productId === String(c.product));
      return found && found.qty >= Number(c.qty || 1);
    });
    if (!okCombo) return 0;
  }

  return eligible.reduce((s, it) => s + roundVND(it.amount), 0);
}

/* ========================= Discount calculation ========================= */
function computeDiscountValue(discount, baseAmount) {
  const type = discount?.type || 'value';
  const value = Number(discount?.value || 0);
  const maxAmount = discount?.maxAmount != null ? Number(discount.maxAmount) : null;

  let amt = 0;
  if (type === 'percent') {
    const pct = clamp(value, 0, 100);
    amt = Math.round((baseAmount * pct) / 100);
  } else {
    amt = roundVND(value);
  }

  if (maxAmount != null) amt = Math.min(amt, Math.max(0, Number(maxAmount)));
  return clamp(amt, 0, baseAmount);
}

/* ========================= Core apply engine ========================= */
/**
 * Áp danh sách khuyến mãi lên bối cảnh hóa đơn
 * @param {Object} ctx
 *  - at: Date
 *  - tableTypeId: ObjectId|string|null
 *  - playMinutes: number
 *  - playAmount: number
 *  - serviceItems: [{productId, categoryId?, price, qty, amount}]
 *  - serviceAmount: number
 *  - subTotal: number
 *  - branchId: ObjectId|string|null
 *  - promotions?: array (optional) nếu đã tải sẵn
 * @returns { discounts: DiscountLine[], summary: { playRemaining, serviceRemaining, billRemaining, discountTotal } }
 */
async function applyPromotions(ctx) {
  const at = ctx.at ? new Date(ctx.at) : new Date();

  // Chuẩn hoá items (gắn categoryId nếu thiếu)
  const items = await normalizeServiceItems(ctx.serviceItems || []);

  // Tải khuyến mãi nếu chưa có
  let promotions = ctx.promotions;
  if (!Array.isArray(promotions)) {
    promotions = await getActivePromotions({ branchId: ctx.branchId || null, at });
  }

  const remaining = buildBaseAmounts({
    playAmount: ctx.playAmount || 0,
    serviceAmount: ctx.serviceAmount || 0,
    subTotal: ctx.subTotal || 0,
  });

  const lines = [];
  let stopDueToNonStackable = false;

  for (const promo of promotions) {
    if (stopDueToNonStackable) break;
    if (!promoIsActiveAt(promo, at)) continue;

    const applyTo = promo?.discount?.applyTo || 'bill';
    const targetBase = pickTargetBase(remaining, applyTo);
    if (targetBase <= 0) continue; // không còn gì để giảm

    let eligibleBase = 0;
    let ok = true;
    const meta = {
      promoId: String(promo._id || ''),
      scope: promo.scope,
      code: promo.code,
    };

    if (promo.scope === 'time') {
      // Điều kiện loại bàn / phút chơi
      const tt = (promo.timeRule?.tableTypes || []).map(String);
      if (tt.length && !includesObjectId(tt, ctx.tableTypeId)) ok = false;

      const minMin = Number(promo.timeRule?.minMinutes || 0);
      if (ctx.playMinutes != null && ctx.playMinutes < minMin) ok = false;

      eligibleBase = targetBase; // áp trực tiếp lên target chọn (play/service/bill)
    } else if (promo.scope === 'product') {
      const base = sumEligibleProductAmount(items, promo.productRule || {});
      if (applyTo === 'service' || applyTo === 'bill') {
        // không cho giảm vượt quá phần dịch vụ đủ điều kiện
        eligibleBase = Math.min(targetBase, base);
      } else {
        ok = false; // product-scope không áp vào 'play'
      }
      meta.eligibleServiceBase = base;
    } else if (promo.scope === 'bill') {
      const br = promo.billRule || {};
      const tt = (br.tableTypes || []).map(String);
      if (tt.length && !includesObjectId(tt, ctx.tableTypeId)) ok = false;

      const minSubtotal = Number(br.minSubtotal || 0);
      if ((ctx.subTotal || 0) < minSubtotal) ok = false;

      const minServiceAmount = Number(br.minServiceAmount || 0);
      if ((ctx.serviceAmount || 0) < minServiceAmount) ok = false;

      const minPlayMinutes = Number(br.minPlayMinutes || 0);
      if ((ctx.playMinutes || 0) < minPlayMinutes) ok = false;

      eligibleBase = targetBase;
    } else {
      ok = false;
    }

    if (!ok || eligibleBase <= 0) continue;

    // Tính số tiền giảm theo rule
    const cut = computeDiscountValue(promo.discount, eligibleBase);
    if (cut <= 0) continue;

    // Cập nhật remaining trên mục tiêu
    deductTargetBase(remaining, applyTo, cut);

    lines.push({
      name: promo.name,
      type: promo.discount.type,
      value: promo.discount.value,
      amount: cut,
      applyTo,
      meta,
    });

    if (promo.stackable === false) {
      stopDueToNonStackable = true;
    }
  }

  const discountTotal = lines.reduce((s, d) => s + roundVND(d.amount || 0), 0);
  return { discounts: lines, summary: { ...remaining, discountTotal } };
}

/* ========== Build context helpers (from Session doc) ========== */
/**
 * Tạo bill context từ dữ liệu phiên (Session) — dùng trước khi checkout.
 * Ưu tiên dữ liệu từ preview (billing.previewClose), nếu không có sẽ
 * cố gắng suy luận best-effort.
 */
async function buildContextFromSession(s, opt = {}) {
  const endAt = opt.endAt ? new Date(opt.endAt) : new Date();
  let playMinutes, playAmount, serviceAmount, subTotal;

  if (opt.preview) {
    playMinutes = Number(opt.preview.billMinutes || 0);
    playAmount = Number(opt.preview.playAmount || 0);
    serviceAmount = Number(opt.preview.serviceAmount || 0);
    subTotal = Number(opt.preview.subTotal || (playAmount + serviceAmount));
  } else {
    // Không có preview ⇒ fallback
    playMinutes = Number(s.durationMinutes || 0);
    playAmount = 0; // không đủ dữ liệu rate ⇒ khuyến nghị gọi preview trước
    serviceAmount = Number(s.serviceAmount || 0);
    subTotal = playAmount + serviceAmount;
  }

  const serviceItems = (s.items || []).map(it => ({
    productId: it.product ? String(it.product) : null,
    price: it.priceSnapshot,
    qty: it.qty,
    amount: (Number(it.priceSnapshot || 0) * Number(it.qty || 0)),
    // categoryId sẽ được fill bởi normalizeServiceItems nếu thiếu
  }));

  // Xác định tableTypeId tương thích nhiều snapshot khác nhau
  let tableTypeId =
    (s.tableTypeSnapshot && s.tableTypeSnapshot.typeId ? String(s.tableTypeSnapshot.typeId) : null) ||
    (s.pricingSnapshot && s.pricingSnapshot.typeId ? String(s.pricingSnapshot.typeId) : null) ||
    null;

  if (!tableTypeId && s.table) {
    // Thử lấy từ Table nếu có thể (best-effort)
    try {
      const t = await Table.findById(s.table).select('type').lean();
      if (t?.type) tableTypeId = String(t.type);
    } catch { /* ignore */ }
  }

  return {
    at: endAt,
    tableTypeId,
    playMinutes,
    playAmount,
    serviceItems,
    serviceAmount,
    subTotal,
    branchId: s.branchId ? String(s.branchId) : null,
  };
}

module.exports = {
  getActivePromotions,
  applyPromotions,
  buildContextFromSession,
};
