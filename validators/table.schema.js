// validators/table.schema.js
const Joi = require('joi');

// ----- Helpers -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const TABLE_STATUS = ['available', 'playing', 'reserved', 'maintenance'];

// ----- Schemas -----

// GET /tables
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    q: Joi.string().trim().allow('', null),                 // search theo name
    status: Joi.string().valid(...TABLE_STATUS).optional(),
    areaId: objectId().allow(null, ''),                     // lọc theo khu vực
    active: Joi.boolean().optional(),

    // sort: 'orderIndex' | '-orderIndex' | 'name' | '-name' | 'createdAt' | '-createdAt' | 'status'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(orderIndex|name|createdAt|status)$/)
      .default('orderIndex'),
  }),
};

// POST /tables
module.exports.create = {
  body: Joi.object({
    name: Joi.string().trim().max(64).required(),
    areaId: objectId().allow(null).optional(),              // có thể chưa gán khu vực
    ratePerHour: Joi.number().min(0).required(),            // bắt buộc vì đã bỏ TableType
    orderIndex: Joi.number().integer().min(0).default(0),
    active: Joi.boolean().default(true),
  }),
};

// PUT /tables/:id
module.exports.update = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    name: Joi.string().trim().max(64),
    areaId: objectId().allow(null),
    ratePerHour: Joi.number().min(0),
    orderIndex: Joi.number().integer().min(0),
    active: Joi.boolean(),
  }).min(1),
};

// PATCH /tables/:id/status
module.exports.changeStatus = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    status: Joi.string().valid(...TABLE_STATUS).required(),
  }),
};

// PATCH /tables/:id/active
module.exports.setActive = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// PATCH /tables/:id/rate
module.exports.setRate = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    ratePerHour: Joi.number().min(0).required(),
  }),
};

// PATCH /tables/reorder  (đổi thứ tự nhiều bàn)
module.exports.reorder = {
  body: Joi.object({
    items: Joi.array()
      .min(1)
      .max(1000)
      .items(
        Joi.object({
          id: objectId().required(),
          orderIndex: Joi.number().integer().min(0).required(),
        })
      )
      .required(),
  }),
};

// DELETE /tables/:id
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.TABLE_STATUS = TABLE_STATUS;
