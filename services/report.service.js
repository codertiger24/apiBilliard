// services/report.service.js
const mongoose = require('mongoose');
const Bill = require('../models/bill.model');
const Table = require('../models/table.model');
const Product = require('../models/product.model');

const DEFAULT_TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

/** -------------------- Helpers: thời gian & lọc -------------------- */
function ensureRange({ from, to, tz = DEFAULT_TZ } = {}) {
  const now = new Date();
  let start = from ? new Date(from) : new Date(now);
  let end = to ? new Date(to) : new Date(now);

  // nếu không truyền -> mặc định hôm nay theo giờ hệ thống
  if (!from) start.setHours(0, 0, 0, 0);
  if (!to) end.setHours(23, 59, 59, 999);

  return { from: start, to: end, tz };
}

function isValidObjectId(v) {
  return typeof v === 'string' && v.length === 24 && /^[0-9a-fA-F]{24}$/.test(v);
}

function asObjectIdOrNull(v) {
  try {
    return isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null;
  } catch {
    return null;
  }
}

function matchStage({ from, to, branchId = null, staff = null, paidOnly = true }) {
  const $and = [{ createdAt: { $gte: from, $lte: to } }];

  const bId = asObjectIdOrNull(branchId);
  if (bId) $and.push({ branchId: bId });

  const sId = asObjectIdOrNull(staff);
  if (sId) $and.push({ staff: sId });

  if (paidOnly) $and.push({ paid: true });
  return { $and };
}

/**
 * Một số nơi dùng `discounts`, một số nơi dùng `discountLines`.
 * Chuẩn hoá: tạo mảng `__discountArr` là discounts || discountLines (nếu có).
 */
const normalizeDiscountArray = {
  $addFields: {
    __discountArr: {
      $cond: [
        { $gt: [{ $size: { $ifNull: ['$discounts', []] } }, 0] },
        '$discounts',
        { $ifNull: ['$discountLines', []] },
      ],
    },
  },
};

const addDiscountTotal = {
  $addFields: {
    discountTotal: { $sum: '$__discountArr.amount' },
  },
};

/** -------------------- 1) Tổng hợp nhanh (dashboard) -------------------- */
/**
 * Tổng hợp doanh thu & chỉ số cơ bản.
 * @returns {
 *  total, playAmount, serviceAmount, discountTotal, surcharge,
 *  bills, billsPaid, avgTicket, byPayment: [{paymentMethod, total, bills}],
 *  byStaff: [{staff, total, bills}]
 * }
 */
async function summaryReport({
  from,
  to,
  branchId = null,
  paidOnly = true,
  tz = DEFAULT_TZ,
} = {}) {
  const range = ensureRange({ from, to, tz });
  const $match = matchStage({ ...range, branchId, paidOnly });

  const pipeline = [
    { $match },
    normalizeDiscountArray,
    addDiscountTotal,
    {
      $group: {
        _id: null,
        bills: { $sum: 1 },
        billsPaid: { $sum: { $cond: ['$paid', 1, 0] } },
        playAmount: { $sum: '$playAmount' },
        serviceAmount: { $sum: '$serviceAmount' },
        discountTotal: { $sum: '$discountTotal' },
        surcharge: { $sum: '$surcharge' },
        total: { $sum: '$total' },
      },
    },
  ];

  const [agg] = await Bill.aggregate(pipeline);
  const base =
    agg || {
      bills: 0,
      billsPaid: 0,
      playAmount: 0,
      serviceAmount: 0,
      discountTotal: 0,
      surcharge: 0,
      total: 0,
    };
  const avgTicket = base.billsPaid ? Math.round(base.total / base.billsPaid) : 0;

  // phân bổ theo phương thức thanh toán
  const pm = await Bill.aggregate([
    { $match },
    { $group: { _id: '$paymentMethod', total: { $sum: '$total' }, bills: { $sum: 1 } } },
    { $project: { _id: 0, paymentMethod: '$_id', total: 1, bills: 1 } },
    { $sort: { total: -1 } },
  ]);

  // theo nhân viên
  const staff = await Bill.aggregate([
    { $match },
    { $group: { _id: '$staff', total: { $sum: '$total' }, bills: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        staff: '$_id',
        total: 1,
        bills: 1,
      },
    },
    { $sort: { total: -1 } },
  ]);

  return { ...base, avgTicket, byPayment: pm, byStaff: staff, range };
}

/** -------------------- 2) Chuỗi thời gian theo ngày -------------------- */
/**
 * Doanh thu theo ngày (có timezone).
 * @returns [{ date: 'YYYY-MM-DD', total, bills, playAmount, serviceAmount, discountTotal, surcharge }]
 */
async function revenueTimeseries({
  from,
  to,
  branchId = null,
  paidOnly = true,
  tz = DEFAULT_TZ,
} = {}) {
  const range = ensureRange({ from, to, tz });
  const $match = matchStage({ ...range, branchId, paidOnly });

  const pipeline = [
    { $match },
    normalizeDiscountArray,
    addDiscountTotal,
    {
      $project: {
        date: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: range.tz,
          },
        },
        playAmount: 1,
        serviceAmount: 1,
        discountTotal: 1,
        surcharge: 1,
        total: 1,
      },
    },
    {
      $group: {
        _id: '$date',
        bills: { $sum: 1 },
        playAmount: { $sum: '$playAmount' },
        serviceAmount: { $sum: '$serviceAmount' },
        discountTotal: { $sum: '$discountTotal' },
        surcharge: { $sum: '$surcharge' },
        total: { $sum: '$total' },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id',
        bills: 1,
        playAmount: 1,
        serviceAmount: 1,
        discountTotal: 1,
        surcharge: 1,
        total: 1,
      },
    },
    { $sort: { date: 1 } },
  ];

  return Bill.aggregate(pipeline);
}

/** -------------------- 2b) Chuỗi thời gian linh hoạt: ngày / tháng -------------------- */
/**
 * Doanh thu theo ngày hoặc theo tháng.
 * groupBy = 'day' | 'month'
 * - 'day'   → date: 'YYYY-MM-DD'
 * - 'month' → date: 'YYYY-MM'
 * @returns [{ date, total, bills, playAmount, serviceAmount, discountTotal, surcharge }]
 */
async function revenueSeries({
  from,
  to,
  branchId = null,
  paidOnly = true,
  tz = DEFAULT_TZ,
  groupBy = 'day',
} = {}) {
  const range = ensureRange({ from, to, tz });
  const $match = matchStage({ ...range, branchId, paidOnly });

  const format = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const pipeline = [
    { $match },
    normalizeDiscountArray,
    addDiscountTotal,
    {
      $project: {
        date: {
          $dateToString: {
            format,
            date: '$createdAt',
            timezone: range.tz,
          },
        },
        playAmount: 1,
        serviceAmount: 1,
        discountTotal: 1,
        surcharge: 1,
        total: 1,
      },
    },
    {
      $group: {
        _id: '$date',
        bills: { $sum: 1 },
        playAmount: { $sum: '$playAmount' },
        serviceAmount: { $sum: '$serviceAmount' },
        discountTotal: { $sum: '$discountTotal' },
        surcharge: { $sum: '$surcharge' },
        total: { $sum: '$total' },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id',
        bills: 1,
        playAmount: 1,
        serviceAmount: 1,
        discountTotal: 1,
        surcharge: 1,
        total: 1,
      },
    },
    { $sort: { date: 1 } },
  ];

  return Bill.aggregate(pipeline);
}

/** -------------------- 3) Top bàn (theo doanh thu & phút chơi) -------------------- */
/**
 * Top bàn theo tổng tiền & tổng phút chơi.
 * @returns [{ table, tableName, total, playAmount, serviceAmount, minutes }]
 */
async function topTables({
  from,
  to,
  branchId = null,
  paidOnly = true,
  limit = 10,
} = {}) {
  const range = ensureRange({ from, to });
  const $match = matchStage({ ...range, branchId, paidOnly });

  // Tổng tiền theo bàn
  const totals = await Bill.aggregate([
    { $match },
    {
      $group: {
        _id: '$table',
        total: { $sum: '$total' },
        playAmount: { $sum: '$playAmount' },
        serviceAmount: { $sum: '$serviceAmount' },
      },
    },
  ]);

  // Tổng phút chơi theo bàn (từ item type='play')
  const minutes = await Bill.aggregate([
    { $match },
    { $unwind: '$items' },
    { $match: { 'items.type': 'play' } },
    { $group: { _id: '$table', minutes: { $sum: '$items.minutes' } } },
  ]);

  const minuteMap = Object.fromEntries(
    minutes.map((m) => [String(m._id), m.minutes || 0])
  );

  // Join tên bàn
  const ids = totals.map((t) => t._id).filter(Boolean);
  const tables = await Table.find({ _id: { $in: ids } })
    .select('_id name')
    .lean();
  const nameMap = Object.fromEntries(
    tables.map((t) => [String(t._id), t.name])
  );

  const rows = totals.map((t) => ({
    table: String(t._id),
    tableName: nameMap[String(t._id)] || '(unknown)',
    total: t.total || 0,
    playAmount: t.playAmount || 0,
    serviceAmount: t.serviceAmount || 0,
    minutes: minuteMap[String(t._id)] || 0,
  }));

  rows.sort((a, b) => b.total - a.total);
  return rows.slice(0, Math.max(1, Math.min(100, Number(limit) || 10)));
}

/** -------------------- 4) Top sản phẩm (theo số lượng / doanh thu) -------------------- */
/**
 * Top sản phẩm bán chạy.
 * @param {'qty'|'amount'} by - tiêu chí xếp hạng
 * @returns [{ productId, name, qty, amount }]
 */
async function topProducts({
  from,
  to,
  branchId = null,
  paidOnly = true,
  limit = 10,
  by = 'qty',
} = {}) {
  const range = ensureRange({ from, to });
  const $match = matchStage({ ...range, branchId, paidOnly });

  const pipeline = [
    { $match },
    { $unwind: '$items' },
    { $match: { 'items.type': 'product' } },
    {
      $group: {
        _id: { productId: '$items.productId', name: '$items.nameSnapshot' },
        qty: { $sum: '$items.qty' },
        amount: { $sum: '$items.amount' },
      },
    },
    {
      $project: {
        _id: 0,
        productId: '$_id.productId',
        name: '$_id.name',
        qty: 1,
        amount: 1,
      },
    },
    { $sort: by === 'amount' ? { amount: -1 } : { qty: -1 } },
    { $limit: Math.max(1, Math.min(100, Number(limit) || 10)) },
  ];

  const rows = await Bill.aggregate(pipeline);

  // Bổ sung tên từ Product nếu nameSnapshot trống
  const missing = rows.filter((r) => !r.name && r.productId);
  if (missing.length) {
    const ids = missing.map((m) => m.productId).filter(Boolean);
    const prods = await Product.find({ _id: { $in: ids } })
      .select('_id name')
      .lean();
    const pmap = Object.fromEntries(prods.map((p) => [String(p._id), p.name]));
    rows.forEach((r) => {
      if (!r.name && r.productId) r.name = pmap[String(r.productId)] || '';
    });
  }

  return rows;
}

/** -------------------- 5) Theo nhân viên -------------------- */
/**
 * Doanh thu theo nhân viên (thu ngân/lập hóa đơn).
 * @returns [{ staff, total, bills, avgTicket }]
 */
async function revenueByStaff({
  from,
  to,
  branchId = null,
  paidOnly = true,
  limit = 20,
} = {}) {
  const range = ensureRange({ from, to });
  const $match = matchStage({ ...range, branchId, paidOnly });

  const rows = await Bill.aggregate([
    { $match },
    { $group: { _id: '$staff', total: { $sum: '$total' }, bills: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        staff: '$_id',
        total: 1,
        bills: 1,
        avgTicket: {
          $cond: [
            { $gt: ['$bills', 0] },
            { $round: [{ $divide: ['$total', '$bills'] }, 0] },
            0,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
    { $limit: Math.max(1, Math.min(100, Number(limit) || 20)) },
  ]);

  return rows;
}

/** -------------------- 6) Theo phương thức thanh toán -------------------- */
/**
 * Breakdown doanh thu theo paymentMethod.
 * @returns [{ paymentMethod, total, bills }]
 */
async function revenueByPaymentMethod({
  from,
  to,
  branchId = null,
  paidOnly = true,
} = {}) {
  const range = ensureRange({ from, to });
  const $match = matchStage({ ...range, branchId, paidOnly });

  return Bill.aggregate([
    { $match },
    {
      $group: {
        _id: '$paymentMethod',
        total: { $sum: '$total' },
        bills: { $sum: 1 },
      },
    },
    { $project: { _id: 0, paymentMethod: '$_id', total: 1, bills: 1 } },
    { $sort: { total: -1 } },
  ]);
}

/** -------------------- Exports -------------------- */
module.exports = {
  ensureRange,
  summaryReport,
  revenueTimeseries,   // theo ngày (cũ)
  revenueSeries,       // ngày / tháng (mới thêm)
  topTables,
  topProducts,
  revenueByStaff,
  revenueByPaymentMethod,
};
