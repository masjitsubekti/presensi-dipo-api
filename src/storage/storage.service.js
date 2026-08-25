const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * StorageService — Abstraction layer for file storage.
 *
 * Current implementation: Local disk storage.
 * Files are saved to: /public/uploads/<folder>/<random-filename>
 * Files are served at: GET /uploads/<folder>/<filename>
 *
 * To switch to S3/R2, replace the `save` implementation below.
 */

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dir
 */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Generate a random filename preserving the original extension.
 * @param {string} originalName
 * @param {string} mimeType
 * @returns {string}
 */
const generateFilename = (originalName = '', mimeType = '') => {
  let ext = path.extname(originalName);
  if (!ext) {
    ext = mimeType === 'application/pdf'
      ? '.pdf'
      : mimeType === 'image/webp'
      ? '.webp'
      : mimeType === 'image/png'
      ? '.png'
      : '.jpg';
  }
  const random = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}_${random}${ext}`;
};

/**
 * Save a file buffer/stream to the storage.
 *
 * @param {Buffer} buffer - File content as Buffer
 * @param {string} mimeType - MIME type of the file
 * @param {string} folder - Sub-folder name, e.g. 'attendance/checkin'
 * @param {string} [originalName] - Original filename (for extension hint)
 * @returns {Promise<string>} - Relative public URL path, e.g. '/uploads/attendance/checkin/xxx.jpg'
 */
const save = async (buffer, mimeType, folder = 'attendance', originalName = '') => {
  const dir = path.join(UPLOAD_BASE_DIR, folder);
  ensureDir(dir);

  const filename = generateFilename(originalName, mimeType);
  const filePath = path.join(dir, filename);

  await fs.promises.writeFile(filePath, buffer);

  // Return a relative URL accessible via Express static middleware
  return `/uploads/${folder}/${filename}`;
};

/**
 * Delete a file from storage.
 * @param {string} filePath - Relative path, e.g. '/uploads/attendance/checkin/xxx.jpg'
 */
const remove = async (filePath) => {
  if (!filePath) return;
  try {
    const absolutePath = path.join(process.cwd(), 'public', filePath);
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
    }
  } catch (err) {
    console.error(`[StorageService] Failed to delete file ${filePath}:`, err.message);
  }
};

/**
 * Build full URL for a stored file.
 * @param {string} storedPath - e.g. '/uploads/attendance/checkin/xxx.jpg'
 * @returns {string}
 */
const getUrl = (storedPath) => {
  if (!storedPath) return null;
  const baseUrl = process.env.APP_URL || '';
  return `${baseUrl}${storedPath}`;
};

module.exports = { save, remove, getUrl };
