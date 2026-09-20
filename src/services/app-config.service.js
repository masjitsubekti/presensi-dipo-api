const prisma = require('../config/prisma');
const storageService = require('../storage/storage.service');

const formatConfigDTO = (config) => {
  if (!config) return null;
  return {
    id: config.id.toString(),
    appName: config.app_name || '',
    appLogo: config.app_logo || null,
    companyName: config.company_name || '',
    companyEmail: config.company_email || '',
    companyLogo: config.company_logo || null,
    address: config.address || '',
    smtpHost: config.smtp_host || '',
    smtpPort: config.smtp_port || null,
    smtpEmail: config.smtp_email || '',
    smtpPassword: config.smtp_password || '',
    allowHolidayAttendance: config.allowHolidayAttendance ?? true,
    saveAttendancePhoto: config.saveAttendancePhoto ?? true,
    requireAttendancePhoto: config.requireAttendancePhoto ?? true,
    storageDriver: config.storageDriver || 'local',
    // Fallback snake_case
    app_name: config.app_name || '',
    app_logo: config.app_logo || null,
    company_name: config.company_name || '',
    company_email: config.company_email || '',
    company_logo: config.company_logo || null,
    smtp_host: config.smtp_host || '',
    smtp_port: config.smtp_port || null,
    smtp_email: config.smtp_email || '',
    smtp_password: config.smtp_password || '',
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
};

let _cachedConfig = null;

/**
 * AppConfig Service — Get or Create default app configuration (with in-memory cache)
 */
const getAppConfig = async (forceRefresh = false) => {
  if (_cachedConfig && !forceRefresh) {
    return _cachedConfig;
  }
  let config = await prisma.appConfig.findFirst();
  if (!config) {
    config = await prisma.appConfig.create({
      data: {
        id: 1,
        app_name: 'Presensi Pegawai',
        company_name: 'Dipo Group',
        allowHolidayAttendance: true,
        saveAttendancePhoto: true,
        requireAttendancePhoto: true,
      },
    });
  }
  _cachedConfig = formatConfigDTO(config);
  return _cachedConfig;
};

const getById = async (id, forceRefresh = false) => {
  if (_cachedConfig && !forceRefresh && String(_cachedConfig.id) === String(id)) {
    return _cachedConfig;
  }
  const config = await prisma.appConfig.findFirst({
    where: { id: BigInt(id) },
  });
  if (!config) return await getAppConfig(forceRefresh);
  _cachedConfig = formatConfigDTO(config);
  return _cachedConfig;
};

const update = async (id, data) => {
  const existing = await getById(id, true);
  const updated = await prisma.appConfig.update({
    where: { id: BigInt(existing.id) },
    data: {
      app_name: data.app_name !== undefined ? data.app_name : (data.appName !== undefined ? data.appName : existing.app_name),
      app_logo: data.app_logo !== undefined ? data.app_logo : (data.appLogo !== undefined ? data.appLogo : existing.app_logo),
      company_name: data.company_name !== undefined ? data.company_name : (data.companyName !== undefined ? data.companyName : existing.company_name),
      company_email: data.company_email !== undefined ? data.company_email : (data.companyEmail !== undefined ? data.companyEmail : existing.company_email),
      company_logo: data.company_logo !== undefined ? data.company_logo : (data.companyLogo !== undefined ? data.companyLogo : existing.company_logo),
      address: data.address !== undefined ? data.address : existing.address,
      smtp_host: data.smtp_host !== undefined ? data.smtp_host : (data.smtpHost !== undefined ? data.smtpHost : existing.smtp_host),
      smtp_port: data.smtp_port !== undefined 
        ? (data.smtp_port ? parseInt(data.smtp_port) : null) 
        : (data.smtpPort !== undefined ? (data.smtpPort ? parseInt(data.smtpPort) : null) : existing.smtp_port),
      smtp_email: data.smtp_email !== undefined ? data.smtp_email : (data.smtpEmail !== undefined ? data.smtpEmail : existing.smtp_email),
      smtp_password: data.smtp_password !== undefined ? data.smtp_password : (data.smtpPassword !== undefined ? data.smtpPassword : existing.smtp_password),
      allowHolidayAttendance: data.allowHolidayAttendance !== undefined
        ? Boolean(data.allowHolidayAttendance)
        : (data.allow_holiday_attendance !== undefined ? Boolean(data.allow_holiday_attendance) : existing.allowHolidayAttendance),
      saveAttendancePhoto: data.saveAttendancePhoto !== undefined
        ? Boolean(data.saveAttendancePhoto)
        : (data.save_attendance_photo !== undefined ? Boolean(data.save_attendance_photo) : existing.saveAttendancePhoto),
      requireAttendancePhoto: data.requireAttendancePhoto !== undefined
        ? Boolean(data.requireAttendancePhoto)
        : (data.require_attendance_photo !== undefined ? Boolean(data.require_attendance_photo) : existing.requireAttendancePhoto),
      storageDriver: data.storageDriver !== undefined ? data.storageDriver : (data.storage_driver !== undefined ? data.storage_driver : existing.storageDriver),
    },
  });
  _cachedConfig = formatConfigDTO(updated);
  if (storageService.clearStorageCache) {
    storageService.clearStorageCache(_cachedConfig.storageDriver);
  }
  return _cachedConfig;
};

const uploadLogo = async (file) => {
  if (!file) {
    throw { status: 400, message: 'File wajib diunggah' };
  }
  const relativePath = await storageService.uploadFile(
    file.buffer,
    file.mimetype,
    'app-config',
    'logo',
    file.originalname
  );
  return relativePath;
};

module.exports = { getAppConfig, getById, update, uploadLogo };
