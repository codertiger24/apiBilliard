// validators/product.schema.js
const Joi = require('joi');

// ----- Helpers -----
const objectId = () =>
  Joi.string().trim().length(24).hex().messages({
    'string.length': 'Invalid ObjectId length',
    'string.hex': 'Invalid ObjectId',
  });

const sku = Joi.string()
  .trim()
  .uppercase()
  .max(64)
  .pattern(/^[A-Z0-9._-]+$/)
  .messages({ 'string.pattern.base': 'sku chỉ gồm A-Z, 0-9, ., _, -' });

const name = Joi.string().trim().max(160);
const unit = Joi.string().trim().max(32);
const price = Joi.number().min(0);

// ====== LIST (GET /products) ======
module.exports.list = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    q: Joi.string().trim().allow('', null),           // tìm theo name/sku/tags
    category: objectId().optional(),
    tag: Joi.string().trim().max(40).optional(),
    active: Joi.boolean().optional(),
    isService: Joi.boolean().optional(),

    minPrice: price.optional(),
    maxPrice: price.optional(),

    // 'name' | '-name' | 'price' | '-price' | 'createdAt' | '-createdAt'
    sort: Joi.string().trim()
      .pattern(/^(-)?(name|price|createdAt)$/)
      .default('name'),
  }).with('minPrice', 'maxPrice'),
};

// ====== CREATE (POST /products) ======
module.exports.create = {
  body: Joi.object({
    name: name.required(),
    sku: sku.allow(null, '').optional(),
    category: objectId().required(),
    price: price.required(),
    unit: unit.allow('', null).optional(),
    isService: Joi.boolean().default(false),
    images: Joi.array().items(Joi.string().trim()).max(10).default([]), // lưu path '/uploads/...'
    tags: Joi.array().items(Joi.string().trim().max(40)).max(20).default([]),
    active: Joi.boolean().default(true),
    note: Joi.string().trim().max(500).allow('', null).optional(),
  }),
};

// ====== UPDATE (PUT /products/:id) ======
module.exports.update = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    name,
    sku: sku.allow(null, ''),
    category: objectId(),
    price,
    unit: unit.allow('', null),
    isService: Joi.boolean(),
    images: Joi.array().items(Joi.string().trim()).max(10),
    tags: Joi.array().items(Joi.string().trim().max(40)).max(20),
    active: Joi.boolean(),
    note: Joi.string().trim().max(500).allow('', null),
  }).min(1),
};

// ====== SET ACTIVE (PATCH /products/:id/active) ======
module.exports.setActive = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
};

// ====== SET PRICE (PATCH /products/:id/price) ======
module.exports.setPrice = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    price: price.required(),
  }),
};

// ====== REPLACE IMAGES (PATCH /products/:id/images) ======
module.exports.setImages = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    images: Joi.array().max(10).items(Joi.string().trim()).required(),
  }),
};

// ====== ADD TAGS (PATCH /products/:id/tags/add) ======
module.exports.addTags = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    tags: Joi.array().items(Joi.string().trim().max(40)).min(1).max(20).required(),
  }),
};

// ====== REMOVE TAGS (PATCH /products/:id/tags/remove) ======
module.exports.removeTags = {
  params: Joi.object({ id: objectId().required() }),
  body: Joi.object({
    tags: Joi.array().items(Joi.string().trim().max(40)).min(1).required(),
  }),
};

// ====== GET ONE (GET /products/:id) ======
module.exports.getOne = {
  params: Joi.object({ id: objectId().required() }),
};

// ====== DELETE (DELETE /products/:id) ======
module.exports.remove = {
  params: Joi.object({ id: objectId().required() }),
};

module.exports.objectId = objectId;
