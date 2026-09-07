const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const prisma = require('../config/prisma');
const { formatTz } = require('../utils/timezone');

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Ensure directory exists
 */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Normalize relative file path (removes leading slashes or '/uploads/')
 */
const normalizePath = (filePath = '') => {
  if (!filePath) return '';
  let cleaned = String(filePath).trim().replace(/\\/g, '/');
  if (cleaned.startsWith('/uploads/')) cleaned = cleaned.substring('/uploads/'.length);
  if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
  if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
  return cleaned;
};

/**
 * Get MIME Type from file path/extension
 */
const getMimeType = (filePath = '', fallback = 'image/jpeg') => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeMap[ext] || fallback;
};

/**
 * Get active storage configuration (reads storageDriver from app_config or env, credentials strictly from .env)
 */
const getStorageConfig = async () => {
  let driver = process.env.STORAGE_DRIVER || 'local';

  try {
    const configResult = await prisma.$queryRawUnsafe(`
      SELECT storage_driver AS storageDriver
      FROM app_config 
      LIMIT 1
    `);
    if (configResult && configResult[0] && configResult[0].storageDriver) {
      driver = configResult[0].storageDriver;
    }
  } catch (_err) {
    // Fallback to process.env.STORAGE_DRIVER
  }

  return {
    driver,
    supabaseS3Endpoint: process.env.SUPABASE_S3_ENDPOINT || '',
    supabaseAccessKeyId: process.env.SUPABASE_ACCESS_KEY_ID || '',
    supabaseSecretAccessKey: process.env.SUPABASE_SECRET_ACCESS_KEY || '',
    supabaseBucketName: process.env.SUPABASE_BUCKET_NAME || 'dipo-attendance',
    supabasePublicDomain: process.env.SUPABASE_PUBLIC_DOMAIN || '',
  };
};

/**
 * Get S3Client instance for Supabase Storage
 */
const getSupabaseS3Client = (config) => {
  const endpoint = config.supabaseS3Endpoint;
  const accessKeyId = config.supabaseAccessKeyId;
  const secretAccessKey = config.supabaseSecretAccessKey;

  if (
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    endpoint.includes('your-project-ref') ||
    accessKeyId.includes('your_') ||
    secretAccessKey.includes('your_')
  ) {
    throw {
      status: 400,
      message: 'Kredensial Supabase S3 Storage di .env belum diisi dengan nilai yang valid. Silakan isi SUPABASE_S3_ENDPOINT, SUPABASE_ACCESS_KEY_ID, dan SUPABASE_SECRET_ACCESS_KEY asli Anda atau ubah STORAGE_DRIVER=local.',
    };
  }

  return new S3Client({
    region: 'ap-southeast-1',
    endpoint: endpoint.startsWith('http') ? endpoint : `https://${endpoint}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
};

/**
 * Global Upload File Function
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File MIME type (e.g. 'image/jpeg')
 * @param {string} folder - Destination folder (e.g. 'attendance/checkin', 'requests')
 * @param {string} [prefix] - Filename prefix (e.g. 'checkin', 'checkout', 'request')
 * @param {string} [originalName] - Original filename for extension hint
 * @returns {Promise<string>} Relative file path e.g. 'attendance/checkin/202608/checkin_20260830_a1b2c3d4.jpg'
 */
const uploadFile = async (buffer, mimeType = 'image/jpeg', folder = 'attendance/checkin', prefix = '', originalName = '') => {
  const config = await getStorageConfig();
  const now = new Date();
  const yearMonth = formatTz(now, 'YYYYMM');
  const dateStr = formatTz(now, 'YYYYMMDD');
  const randomStr = crypto.randomBytes(4).toString('hex');

  let ext = path.extname(originalName);
  if (!ext) {
    ext = mimeType === 'application/pdf' ? '.pdf'
      : mimeType === 'image/webp' ? '.webp'
      : mimeType === 'image/png' ? '.png'
      : '.jpg';
  }

  // Target relative folder: e.g. attendance/checkin/202608 or requests/202608
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  const relFolder = `${cleanFolder}/${yearMonth}`;

  // Target filename: e.g. checkin_20260830_a1b2c3d4.jpg or 20260830_a1b2c3d4.pdf
  const fileName = prefix
    ? `${prefix}_${dateStr}_${randomStr}${ext}`
    : `${dateStr}_${randomStr}${ext}`;
  const relativePath = `${relFolder}/${fileName}`;

  if (config.driver === 'supabase') {
    try {
      const s3 = getSupabaseS3Client(config);
      const command = new PutObjectCommand({
        Bucket: config.supabaseBucketName,
        Key: relativePath,
        Body: buffer,
        ContentType: mimeType,
      });
      await s3.send(command);
    } catch (err) {
      if (err.status) throw err;
      console.error('[StorageService] Supabase upload error:', err.message || err);
      throw {
        status: 500,
        message: `Gagal mengunggah file ke Supabase Storage (${err.code || err.message}). Pastikan endpoint dan kredensial Supabase di .env sudah benar.`,
      };
    }
  } else {
    // Local Disk Storage
    const targetDir = path.join(UPLOAD_BASE_DIR, relFolder);
    ensureDir(targetDir);
    const absolutePath = path.join(targetDir, fileName);
    await fs.promises.writeFile(absolutePath, buffer);
  }

  return relativePath;
};

/**
 * Global Stream Reader Function (Used by GET /api/v1/files?path=...)
 *
 * @param {string} rawFilePath
 * @returns {Promise<{ stream: ReadableStream, mimeType: string }>}
 */
const getFileStream = async (rawFilePath) => {
  const relativePath = normalizePath(rawFilePath);
  if (!relativePath) throw { status: 400, message: 'Parameter path wajib diisi' };

  const config = await getStorageConfig();
  const mimeType = getMimeType(relativePath);

  if (config.driver === 'supabase') {
    const s3 = getSupabaseS3Client(config);
    const command = new GetObjectCommand({
      Bucket: config.supabaseBucketName,
      Key: relativePath,
    });
    try {
      const response = await s3.send(command);
      return {
        stream: response.Body,
        mimeType: response.ContentType || mimeType,
      };
    } catch (err) {
      throw { status: 404, message: 'File tidak ditemukan di Supabase Storage' };
    }
  } else {
    // Local Disk Storage
    const absolutePath = path.join(UPLOAD_BASE_DIR, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw { status: 404, message: 'File tidak ditemukan di penyimpanan lokal' };
    }
    const stream = fs.createReadStream(absolutePath);
    return { stream, mimeType };
  }
};

/**
 * Global Delete File Function
 *
 * @param {string} rawFilePath
 */
const deleteFile = async (rawFilePath) => {
  const relativePath = normalizePath(rawFilePath);
  if (!relativePath) return;

  const config = await getStorageConfig();

  if (config.driver === 'supabase') {
    try {
      const s3 = getSupabaseS3Client(config);
      const command = new DeleteObjectCommand({
        Bucket: config.supabaseBucketName,
        Key: relativePath,
      });
      await s3.send(command);
    } catch (err) {
      console.error(`[StorageService] Failed to delete Supabase object ${relativePath}:`, err.message);
    }
  } else {
    try {
      const absolutePath = path.join(UPLOAD_BASE_DIR, relativePath);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch (err) {
      console.error(`[StorageService] Failed to delete local file ${relativePath}:`, err.message);
    }
  }
};

/**
 * Global Public URL Helper Function
 *
 * @param {string} rawFilePath
 * @returns {string|null}
 */
const getFileUrl = (rawFilePath) => {
  const relativePath = normalizePath(rawFilePath);
  if (!relativePath) return null;

  // If path is already a full http/https URL, return directly
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }

  const baseUrl = process.env.APP_URL || '';
  return `${baseUrl}/api/v1/files?path=${encodeURIComponent(relativePath)}`;
};

module.exports = {
  uploadFile,
  getFileStream,
  deleteFile,
  getFileUrl,
  // Alias functions for backward compatibility
  save: uploadFile,
  remove: deleteFile,
  getUrl: getFileUrl,
};
