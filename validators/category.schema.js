// validators/category.schema.js
const Joi = require('joi');

// ----- Helpers -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const CODE_REGEX = /^[A-Z0-9_-]+$/;              // giống model: uppercase + _, -
const COLOR_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const code = Joi.string()
  .trim()
  .uppercase()
  .max(32)
  .pattern(CODE_REGEX)
  .messages({ 'string.pattern.base': 'code chỉ gồm A-Z, 0-9, _, -' });

const name = Joi.string().trim().max(120);

// ----- Schemas -----

// GET /categories
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    q: Joi.string().trim().allow('', null),           // tìm theo name/code
    active: Joi.boolean().optional(),

    // sort: 'orderIndex' | '-orderIndex' | 'name' | '-name' | 'code' | '-code' | 'createdAt' | '-createdAt'
    sort: Joi.string()
      .trim()
      .pattern(/^(-)?(orderIndex|name|code|createdAt)$/)
      .default('orderIndex'),
  }),
};

// POST /categories
module.exports.create = {
  body: Joi.object({
    name: name.required(),
    code: code.required(),
    description: Joi.string().trim().max(500).allow('', null).optional(),
    icon: Joi.string().trim().max(200).allow('', null).optional(),
    color: Joi.string().trim().pattern(COLOR_HEX).allow('', null).messages({
      'string.pattern.base': 'color phải là mã HEX (#RGB hoặc #RRGGBB)',
    }).optional(),
    orderIndex: Joi.number().integer().min(0).default(0),
    active: Joi.boolean().default(true),
  }),
};

// PUT /categories/:id
module.exports.update = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    name,
    code,
    description: Joi.string().trim().max(500).allow('', null),
    icon: Joi.string().trim().max(200).allow('', null),
    color: Joi.string().trim().pattern(COLOR_HEX).allow('', null).messages({
      'string.pattern.base': 'color phải là mã HEX (#RGB hoặc #RRGGBB)',
    }),
    orderIndex: Joi.number().integer().min(0),
    active: Joi.boolean(),
  }).min(1),
};

// PATCH /categories/:id/active
module.exports.setActive = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// GET /categories/:id
module.exports.getOne = {
  params: Joi.object({ id: objectId().required() }),
};

// DELETE /categories/:id
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.objectId = objectId;
module.exports.CODE_REGEX = CODE_REGEX;
module.exports.COLOR_HEX = COLOR_HEX;
