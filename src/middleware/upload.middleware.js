const multer = require('multer');

/**
 * Creates a dynamic memory storage upload middleware with configurable max size and allowed extensions.
 * 
 * @param {Object} [options]
 * @param {number} [options.maxSizeMb=10] Max file size in Megabytes
 * @param {string[]} [options.allowedExts] Array of allowed extensions (e.g. ['pdf', 'png', 'jpg'])
 */
const createUpload = (options = {}) => {
  const maxSizeMb = options.maxSizeMb || 10;
  const allowedExts = options.allowedExts || ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'xls', 'xlsx'];

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
      if (allowedExts.includes(ext) || file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error(`Format berkas tidak didukung. Gunakan: ${allowedExts.join(', ')}`));
      }
    },
  });
};

// Default global instance (10MB)
const uploadFile = createUpload();

module.exports = {
  createUpload,
  uploadFile,
  upload: uploadFile,
};
