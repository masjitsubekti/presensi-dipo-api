const prisma = require('../config/prisma');

/**
 * AppConfig Service — Get or Create default app configuration
 */
const getAppConfig = async () => {
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
  return {
    ...config,
    id: config.id.toString(),
  };
};

const getById = async (id) => {
  const config = await prisma.appConfig.findFirst({
    where: { id: BigInt(id) },
  });
  if (!config) return await getAppConfig();
  return { ...config, id: config.id.toString() };
};

const update = async (id, data) => {
  const existing = await getById(id);
  const updated = await prisma.appConfig.update({
    where: { id: BigInt(existing.id) },
    data: {
      app_name: data.app_name !== undefined ? data.app_name : existing.app_name,
      app_logo: data.app_logo !== undefined ? data.app_logo : existing.app_logo,
      company_name: data.company_name !== undefined ? data.company_name : existing.company_name,
      company_email: data.company_email !== undefined ? data.company_email : existing.company_email,
      company_logo: data.company_logo !== undefined ? data.company_logo : existing.company_logo,
      address: data.address !== undefined ? data.address : existing.address,
      allowHolidayAttendance: data.allowHolidayAttendance !== undefined
        ? Boolean(data.allowHolidayAttendance)
        : (data.allow_holiday_attendance !== undefined ? Boolean(data.allow_holiday_attendance) : existing.allowHolidayAttendance),
      saveAttendancePhoto: data.saveAttendancePhoto !== undefined
        ? Boolean(data.saveAttendancePhoto)
        : (data.save_attendance_photo !== undefined ? Boolean(data.save_attendance_photo) : existing.saveAttendancePhoto),
      requireAttendancePhoto: data.requireAttendancePhoto !== undefined
        ? Boolean(data.requireAttendancePhoto)
        : (data.require_attendance_photo !== undefined ? Boolean(data.require_attendance_photo) : existing.requireAttendancePhoto),
    },
  });
  return { ...updated, id: updated.id.toString() };
};

module.exports = { getAppConfig, getById, update };
