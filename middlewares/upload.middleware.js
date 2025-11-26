// middlewares/upload.middleware.js
const multer = require('multer');
const path = require('path');

// Thư mục lưu file, ví dụ: /public/uploads/products
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads/products'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);        // .jpg, .png, ...
    const base = path.basename(file.originalname, ext); // ten-file
    const safeName = base.replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeName}${ext}`);
  },
});

const upload = multer({ storage });

module.exports = { upload };
