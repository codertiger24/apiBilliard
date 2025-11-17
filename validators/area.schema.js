// validators/area.schema.js
const Joi = require('joi');
const { JoiObjectId } = require('../middlewares/validate.middleware');

// dùng lại quy ước HEX: #RGB hoặc #RRGGBB
const hexColor = Joi.string().trim().pattern(/^#(?:[0-9a-fA-F]{3}){1,2}$/);

const paging = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  sort: Joi.string().trim().default('orderIndex'), // ví dụ: 'orderIndex' | '-orderIndex' | 'name'
};

const filters = {
  q: Joi.string().allow('', null),
  active: Joi.alternatives().try(Joi.boolean(), Joi.string().valid('true', 'false')),
};

const baseFields = {
  name: Joi.string().trim().min(1).max(100),
  code: Joi.string().trim().min(1).max(20),
  color: hexColor.allow(null, ''),
  orderIndex: Joi.number().integer().min(0).default(0),
  active: Joi.boolean().default(true),
};

module.exports = {
  // GET /areas
  list: {
    query: Joi.object({
      ...paging,
      ...filters,
    }),
  },

  // GET /areas/:id
  getOne: {
    params: Joi.object({
      id: JoiObjectId().required(),
    }),
  },

  // POST /areas
  create: {
    body: Joi.object({
      ...baseFields,
      name: baseFields.name.required(),   // bắt buộc name khi tạo
    }),
  },

  // PUT /areas/:id
  update: {
    params: Joi.object({
      id: JoiObjectId().required(),
    }),
    body: Joi.object({
      ...baseFields,
    }).min(1), // cần ít nhất một trường để cập nhật
  },

  // PATCH /areas/:id/active
  setActive: {
    params: Joi.object({
      id: JoiObjectId().required(),
    }),
    body: Joi.object({
      active: Joi.boolean().required(),
    }),
  },

  // PATCH /areas/reorder
  // body: { items: [{ id, orderIndex }, ...] }
  reorder: {
    body: Joi.object({
      items: Joi.array().items(
        Joi.object({
          id: JoiObjectId().required(),
          orderIndex: Joi.number().integer().min(0).required(),
        })
      ).default([]),
    }),
  },

  // DELETE /areas/:id
  remove: {
    params: Joi.object({
      id: JoiObjectId().required(),
    }),
  },
};
