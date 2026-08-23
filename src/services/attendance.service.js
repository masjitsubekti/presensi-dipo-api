require('dotenv').config();
const prisma = require('../config/prisma');
const { v4: uuidv4 } = require('uuid');
const { checkWithinRadius } = require('../utils/haversine');
const {
  nowInTz,
  todayDateString,
  timeToMinutes,
  currentMinutes,
  diffMinutes,
  formatTzISO,
} = require('../utils/timezone');
const storage = require('../storage/storage.service');
const {
  ATTENDANCE_TYPE,
  ATTENDANCE_STATUS,
  LOG_ACTION,
  LOG_STATUS,
  LOCATION_STATUS,
  ERROR_CODE,
} = require('../constants/attendance.constants');

/**
 * Resolve authenticated user's person and institution
 */
const resolveUserContext = async (userId) => {
  const user = await prisma.authUser.findFirst({
    where: { id: userId, isDeleted: false },
  });
  if (!user) throw { status: 401, message: 'User tidak ditemukan' };
  if (!user.personId) throw { status: 400, message: 'User belum memiliki data pegawai (person)' };
  if (!user.institutionId) throw { status: 400, message: 'User belum terhubung ke institusi' };
  return {
    userId: user.id,
    personId: Number(user.personId),
    institutionId: Number(user.institutionId),
    name: user.name,
  };
};

/**
 * Get active attendance locations for an institution
 */
const getActiveLocations = async (userId) => {
  const { institutionId } = await resolveUserContext(userId);
  const locations = await prisma.mLocation.findMany({
    where: { institutionId, isActive: true, isDeleted: false },
    orderBy: { id: 'asc' },
  });
  return locations.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    latitude: Number(l.latitude),
    longitude: Number(l.longitude),
    radiusMeter: l.radiusMeter,
    isActive: l.isActive,
  }));
};

const appConfigService = require('./app-config.service');

const getAttendanceConfig = async () => {
  const cfg = await appConfigService.getAppConfig();
  return {
    allowHolidayAttendance: cfg.allowHolidayAttendance ?? true,
    saveAttendancePhoto: cfg.saveAttendancePhoto ?? true,
    requireAttendancePhoto: cfg.requireAttendancePhoto ?? true,
  };
};

/**
 * Get today's attendance record for a user
 */
const getTodayAttendance = async (userId) => {
  const { personId, institutionId } = await resolveUserContext(userId);
  const today = todayDateString();
  const now = nowInTz();
  const config = await getAttendanceConfig();

  // Load today's attendance record
  const attendance = await prisma.attendance.findFirst({
    where: {
      personId,
      institutionId,
      attendanceDate: new Date(today),
      attendanceType: ATTENDANCE_TYPE.OFFICE,
      isDeleted: false,
    },
  });

  // Load active shift for today
  const shift = await getActiveShiftForToday(personId, now);

  // Load active location
  const locations = await prisma.mLocation.findMany({
    where: { institutionId, isActive: true, isDeleted: false },
    take: 1,
  });
  const location = locations[0] ?? null;

  const hasCheckin = !!(attendance?.checkinTime);
  const hasCheckout = !!(attendance?.checkoutTime);
  const nowMinutes = currentMinutes();

  let isCheckoutWindowActive = false;
  if (shift?.workTime?.checkoutStart) {
    isCheckoutWindowActive = nowMinutes >= timeToMinutes(shift.workTime.checkoutStart);
  } else if (shift?.workTime?.workEndTime) {
    const workEndMins = timeToMinutes(shift.workTime.workEndTime);
    isCheckoutWindowActive = nowMinutes >= (workEndMins - 60);
  } else if (hasCheckin) {
    isCheckoutWindowActive = true;
  }

  let canCheckin = false;
  let canCheckout = false;
  let timeWindowStatus = 'OPEN'; // OPEN | BEFORE_CHECKIN | AFTER_CHECKIN | BEFORE_CHECKOUT | AFTER_CHECKOUT | HOLIDAY_DISABLED
  let timeWindowMessage = '';

  const isNonWorkingDay = !shift || !shift.isWorkingDay;

  if (isNonWorkingDay && !config.allowHolidayAttendance) {
    canCheckin = false;
    canCheckout = false;
    timeWindowStatus = 'HOLIDAY_DISABLED';
    timeWindowMessage = 'Presensi pada hari libur / non-shift kerja saat ini dinonaktifkan oleh administrator.';
  } else {
    if (!hasCheckin) {
      canCheckin = true;
      canCheckout = false;
    } else {
      if (isCheckoutWindowActive) {
        canCheckin = false;
        canCheckout = true;
      } else {
        canCheckin = true;
        canCheckout = false;
      }
    }

    // Enforce time windows only if it's a designated working day with workTime
    if (shift?.workTime && shift?.isWorkingDay) {
      const wt = shift.workTime;

      if (canCheckin) {
        if (wt.checkinStart && nowMinutes < timeToMinutes(wt.checkinStart)) {
          canCheckin = false;
          timeWindowStatus = 'BEFORE_CHECKIN';
          timeWindowMessage = `Presensi masuk belum dibuka. Jam masuk: ${wt.checkinStart} – ${wt.checkinEnd}`;
        } else if (wt.checkinEnd && nowMinutes > timeToMinutes(wt.checkinEnd)) {
          canCheckin = false;
          timeWindowStatus = 'AFTER_CHECKIN';
          timeWindowMessage = `Batas waktu presensi masuk telah berakhir (${wt.checkinEnd})`;
        }
      }

      if (canCheckout) {
        if (wt.checkoutStart && nowMinutes < timeToMinutes(wt.checkoutStart)) {
          canCheckout = false;
          timeWindowStatus = 'BEFORE_CHECKOUT';
          timeWindowMessage = `Presensi pulang belum dibuka. Jam pulang: ${wt.checkoutStart} – ${wt.checkoutEnd}`;
        } else if (wt.checkoutEnd && nowMinutes > timeToMinutes(wt.checkoutEnd)) {
          canCheckout = false;
          timeWindowStatus = 'AFTER_CHECKOUT';
          timeWindowMessage = `Batas waktu presensi pulang telah berakhir (${wt.checkoutEnd})`;
        }
      }
    }
  }

  return {
    attendance: attendance ? serializeAttendance(attendance) : null,
    can_checkin: canCheckin,
    can_checkout: canCheckout,
    time_window_status: timeWindowStatus,
    time_window_message: timeWindowMessage,
    current_time: now.toISOString(),
    config: {
      allow_holiday_attendance: config.allowHolidayAttendance,
      save_attendance_photo: config.saveAttendancePhoto,
      require_attendance_photo: config.requireAttendancePhoto,
    },
    shift: shift ? serializeShift(shift) : null,
    location: location ? {
      id: location.id,
      name: location.name,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      radiusMeter: location.radiusMeter,
    } : null,
  };
};

/**
 * Helper to get candidate dayOfWeek numbers for querying.
 * Supports:
 * - MySQL standard DAYOFWEEK (1 = Sunday, 2 = Monday, ..., 7 = Saturday)
 * - ISO-8601 standard (1 = Monday, ..., 7 = Sunday)
 * - JavaScript Date.getDay() (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
const getDayOfWeekCandidates = (date) => {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mysqlDay = jsDay + 1;  // 1=Sun, 2=Mon, ..., 7=Sat (Standard MySQL DAYOFWEEK)
  const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon, ..., 7=Sun (ISO 8601)

  return Array.from(new Set([jsDay, mysqlDay, isoDay]));
};

/**
 * Get the active work shift for a person on a given date
 */
const getActiveShiftForToday = async (personId, date) => {
  const dateOnly = new Date(date.toDateString());
  const daysToMatch = getDayOfWeekCandidates(date);

  // Find shift pattern active today
  const pattern = await prisma.workShiftPattern.findFirst({
    where: {
      personId,
      isDeleted: false,
      effectiveFrom: { lte: dateOnly },
      OR: [
        { effectiveUntil: null },
        { effectiveUntil: { gte: dateOnly } },
      ],
    },
    include: {
      shift: {
        include: {
          details: {
            where: { dayOfWeek: { in: daysToMatch }, isDeleted: false },
            include: { workTime: true },
          },
        },
      },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!pattern?.shift) return null;

  const detail = pattern.shift.details[0];
  if (!detail) return null;

  return {
    shiftId: pattern.shiftId,
    shiftName: pattern.shift.name,
    dayOfWeek: detail.dayOfWeek,
    isWorkingDay: detail.isWorkingDay,
    workTime: detail.workTime
      ? {
          id: detail.workTime.id,
          code: detail.workTime.code,
          name: detail.workTime.name,
          workStartTime: detail.workTime.workStartTime,
          workEndTime: detail.workTime.workEndTime,
          checkinStart: detail.workTime.checkinStart,
          checkinEnd: detail.workTime.checkinEnd,
          checkoutStart: detail.workTime.checkoutStart,
          checkoutEnd: detail.workTime.checkoutEnd,
          lateTolerance: detail.workTime.lateTolerance,
          earlyLeaveTolerance: detail.workTime.earlyLeaveTolerance,
        }
      : null,
  };
};

/**
 * CHECK-IN
 */
const checkIn = async (userId, { photoBuffer, photoMimeType, latitude, longitude, attendanceLocationId, device, ipAddress }) => {
  const { personId, institutionId } = await resolveUserContext(userId);
  const now = nowInTz();
  const today = todayDateString();

  const config = await getAttendanceConfig();

  // Validate photo requirement if configured
  if (config.requireAttendancePhoto && !photoBuffer) {
    throw { status: 400, message: 'Foto selfie wajib diambil terlebih dahulu', code: ERROR_CODE.PHOTO_REQUIRED };
  }

  // 1. Validate active location
  const location = await resolveLocation(attendanceLocationId, institutionId);

  // 2. Calculate distance (backend is source of truth)
  const { distance, isWithin } = checkWithinRadius(
    Number(location.latitude),
    Number(location.longitude),
    Number(latitude),
    Number(longitude),
    location.radiusMeter
  );

  const locationStatus = isWithin ? LOCATION_STATUS.VALID : LOCATION_STATUS.OUT_OF_RADIUS;

  // 3. Check duplicate check-in
  const existing = await prisma.attendance.findFirst({
    where: {
      personId,
      institutionId,
      attendanceDate: new Date(today),
      attendanceType: ATTENDANCE_TYPE.OFFICE,
      isDeleted: false,
    },
  });

  if (existing?.checkinTime) {
    // Location validation first for re-checkin
    if (!isWithin) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.OFFICE,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.OUT_OF_RADIUS,
        attendanceId: existing.id, attendanceLocationId, device, ipAddress, now,
      });
      throw {
        status: 400,
        message: 'Anda berada di luar area presensi',
        code: ERROR_CODE.OUT_OF_RADIUS,
        data: { distance_meter: distance, radius_meter: location.radiusMeter },
      };
    }

    // Save photo to storage (if storage saving is enabled) & log re-checkin
    const photoPath = (photoBuffer && config.saveAttendancePhoto)
      ? await storage.save(photoBuffer, photoMimeType, 'attendance/checkin')
      : null;

    await insertLog({
      institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.OFFICE,
      latitude, longitude, distanceMeter: distance, locationStatus,
      status: LOG_STATUS.SUCCESS, attendanceId: existing.id,
      attendanceLocationId: location.id, photo: photoPath, device, ipAddress, now,
    });

    return {
      attendance: serializeAttendance(existing),
      distance_meter: distance,
      late_minutes: existing.lateMinutes,
      status: existing.status,
    };
  }

  // 4. Location validation
  if (!isWithin) {
    await insertLog({
      institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.OFFICE,
      latitude, longitude, distanceMeter: distance, locationStatus,
      status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.OUT_OF_RADIUS,
      attendanceLocationId, device, ipAddress, now,
    });
    throw {
      status: 400,
      message: 'Anda berada di luar area presensi',
      code: ERROR_CODE.OUT_OF_RADIUS,
      data: { distance_meter: distance, radius_meter: location.radiusMeter },
    };
  }

  // 5. Load shift to calculate late_minutes and validate check-in window
  const shift = await getActiveShiftForToday(personId, now);

  const isNonWorkingDay = !shift || !shift.isWorkingDay;
  if (isNonWorkingDay && !config.allowHolidayAttendance) {
    throw { status: 400, message: 'Presensi pada hari libur / non-shift kerja saat ini dinonaktifkan oleh administrator.', code: ERROR_CODE.HOLIDAY };
  }

  let lateMinutes = 0;
  let attendanceStatus = ATTENDANCE_STATUS.PRESENT;

  if (shift?.workTime && shift?.isWorkingDay) {
    const wt = shift.workTime;
    const nowMinutes = currentMinutes();

    if (wt.checkinStart && nowMinutes < timeToMinutes(wt.checkinStart)) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.OFFICE,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKIN_NOT_ALLOWED,
        attendanceLocationId, device, ipAddress, now,
      });
      throw { status: 400, message: `Presensi masuk belum dibuka. Jam masuk: ${wt.checkinStart} – ${wt.checkinEnd}`, code: ERROR_CODE.CHECKIN_NOT_ALLOWED };
    }

    if (wt.checkinEnd && nowMinutes > timeToMinutes(wt.checkinEnd)) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.OFFICE,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKIN_NOT_ALLOWED,
        attendanceLocationId, device, ipAddress, now,
      });
      throw { status: 400, message: `Batas waktu presensi masuk telah berakhir (${wt.checkinEnd})`, code: ERROR_CODE.CHECKIN_NOT_ALLOWED };
    }

    const workStartMinutes = timeToMinutes(wt.workStartTime);
    const tolerance = wt.lateTolerance ?? 0;

    if (nowMinutes > workStartMinutes + tolerance) {
      lateMinutes = nowMinutes - workStartMinutes;
      attendanceStatus = ATTENDANCE_STATUS.LATE;
    }
  }

  // 6. Save photo (if photo saving to storage is enabled)
  const photoPath = (photoBuffer && config.saveAttendancePhoto)
    ? await storage.save(photoBuffer, photoMimeType, 'attendance/checkin')
    : null;

  // 7. Transaction: insert log + create/update attendance
  const result = await prisma.$transaction(async (tx) => {
    // Create attendance
    const attendance = await tx.attendance.create({
      data: {
        institutionId,
        personId,
        attendanceType: ATTENDANCE_TYPE.OFFICE,
        attendanceDate: new Date(today),
        checkinTime: now,
        checkinPhoto: photoPath,
        checkinLocationId: location.id,
        checkinLatitude: Number(latitude),
        checkinLongitude: Number(longitude),
        checkinDistanceMeter: distance,
        status: attendanceStatus,
        lateMinutes,
        createdAt: now,
        createdBy: userId,
      },
    });

    // Insert log
    await tx.attendanceLog.create({
      data: {
        institutionId,
        personId,
        dateTime: now,
        attendanceId: attendance.id,
        attendanceType: ATTENDANCE_TYPE.OFFICE,
        action: LOG_ACTION.CHECKIN,
        attendanceLocationId: location.id,
        photo: photoPath,
        latitude: Number(latitude),
        longitude: Number(longitude),
        distanceMeter: distance,
        locationStatus,
        device: device || null,
        ipAddress: ipAddress || null,
        status: LOG_STATUS.SUCCESS,
        createdAt: now,
        createdBy: userId,
      },
    });

    return attendance;
  });

  return {
    attendance: serializeAttendance(result),
    distance_meter: distance,
    late_minutes: lateMinutes,
    status: attendanceStatus,
  };
};

/**
 * CHECK-OUT
 */
const checkOut = async (userId, { photoBuffer, photoMimeType, latitude, longitude, attendanceLocationId, device, ipAddress }) => {
  const { personId, institutionId } = await resolveUserContext(userId);
  const now = nowInTz();
  const today = todayDateString();

  const config = await getAttendanceConfig();

  // Validate photo requirement if configured
  if (config.requireAttendancePhoto && !photoBuffer) {
    throw { status: 400, message: 'Foto selfie wajib diambil terlebih dahulu', code: ERROR_CODE.PHOTO_REQUIRED };
  }

  // 1. Validate active location
  const location = await resolveLocation(attendanceLocationId, institutionId);

  // 2. Calculate distance
  const { distance, isWithin } = checkWithinRadius(
    Number(location.latitude),
    Number(location.longitude),
    Number(latitude),
    Number(longitude),
    location.radiusMeter
  );

  const locationStatus = isWithin ? LOCATION_STATUS.VALID : LOCATION_STATUS.OUT_OF_RADIUS;

  // 3. Find today's attendance
  const existing = await prisma.attendance.findFirst({
    where: {
      personId,
      institutionId,
      attendanceDate: new Date(today),
      attendanceType: ATTENDANCE_TYPE.OFFICE,
      isDeleted: false,
    },
  });

  if (!existing?.checkinTime) {
    await insertLog({
      institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.OFFICE,
      latitude, longitude, distanceMeter: distance, locationStatus,
      status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKIN_REQUIRED,
      attendanceLocationId, device, ipAddress, now,
    });
    throw { status: 400, message: 'Anda belum melakukan check-in hari ini', code: ERROR_CODE.CHECKIN_REQUIRED };
  }

  // Note: Re-checkout is allowed to update checkoutTime and checkoutPhoto to the latest time

  // 4. Location validation
  if (!isWithin) {
    await insertLog({
      institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.OFFICE,
      latitude, longitude, distanceMeter: distance, locationStatus,
      status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.OUT_OF_RADIUS,
      attendanceId: existing.id, attendanceLocationId, device, ipAddress, now,
    });
    throw {
      status: 400,
      message: 'Anda berada di luar area presensi',
      code: ERROR_CODE.OUT_OF_RADIUS,
      data: { distance_meter: distance, radius_meter: location.radiusMeter },
    };
  }

  // 5. Calculate early_leave and overtime, and validate checkout window
  const shift = await getActiveShiftForToday(personId, now);

  const isNonWorkingDay = !shift || !shift.isWorkingDay;
  if (isNonWorkingDay && !config.allowHolidayAttendance) {
    throw { status: 400, message: 'Presensi pada hari libur / non-shift kerja saat ini dinonaktifkan oleh administrator.', code: ERROR_CODE.HOLIDAY };
  }

  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;

  if (shift?.workTime && shift?.isWorkingDay) {
    const wt = shift.workTime;
    const nowMinutes = currentMinutes();

    if (wt.checkoutStart && nowMinutes < timeToMinutes(wt.checkoutStart)) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.OFFICE,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKOUT_NOT_ALLOWED,
        attendanceId: existing.id, attendanceLocationId, device, ipAddress, now,
      });
      throw { status: 400, message: `Presensi pulang belum dibuka. Jam pulang: ${wt.checkoutStart} – ${wt.checkoutEnd}`, code: ERROR_CODE.CHECKOUT_NOT_ALLOWED };
    }

    if (wt.checkoutEnd && nowMinutes > timeToMinutes(wt.checkoutEnd)) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.OFFICE,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKOUT_NOT_ALLOWED,
        attendanceId: existing.id, attendanceLocationId, device, ipAddress, now,
      });
      throw { status: 400, message: `Batas waktu presensi pulang telah berakhir (${wt.checkoutEnd})`, code: ERROR_CODE.CHECKOUT_NOT_ALLOWED };
    }

    const workEndMinutes = timeToMinutes(wt.workEndTime);
    const tolerance = wt.earlyLeaveTolerance ?? 0;

    if (nowMinutes < workEndMinutes - tolerance) {
      earlyLeaveMinutes = workEndMinutes - nowMinutes;
    } else if (nowMinutes > workEndMinutes) {
      overtimeMinutes = nowMinutes - workEndMinutes;
    }
  }

  // 6. Save photo (if photo saving to storage is enabled)
  const photoPath = (photoBuffer && config.saveAttendancePhoto)
    ? await storage.save(photoBuffer, photoMimeType, 'attendance/checkout')
    : null;

  // 7. Transaction: insert log + update attendance
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.attendance.update({
      where: { id: existing.id },
      data: {
        checkoutTime: now,
        checkoutPhoto: photoPath,
        checkoutLocationId: location.id,
        checkoutLatitude: Number(latitude),
        checkoutLongitude: Number(longitude),
        checkoutDistanceMeter: distance,
        earlyLeaveMinutes,
        overtimeMinutes,
        updatedAt: now,
        updatedBy: userId,
      },
    });

    await tx.attendanceLog.create({
      data: {
        institutionId,
        personId,
        dateTime: now,
        attendanceId: existing.id,
        attendanceType: ATTENDANCE_TYPE.OFFICE,
        action: LOG_ACTION.CHECKOUT,
        attendanceLocationId: location.id,
        photo: photoPath,
        latitude: Number(latitude),
        longitude: Number(longitude),
        distanceMeter: distance,
        locationStatus,
        device: device || null,
        ipAddress: ipAddress || null,
        status: LOG_STATUS.SUCCESS,
        createdAt: now,
        createdBy: userId,
      },
    });

    return updated;
  });

  return {
    attendance: serializeAttendance(result),
    distance_meter: distance,
    early_leave_minutes: earlyLeaveMinutes,
    overtime_minutes: overtimeMinutes,
  };
};

/**
 * Get paginated history
 */
const getHistory = async (userId, params = {}) => {
  const { personId, institutionId } = await resolveUserContext(userId);
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const skip = (page - 1) * limit;

  const where = {
    personId,
    institutionId,
    attendanceType: params.attendance_type || ATTENDANCE_TYPE.OFFICE,
    isDeleted: false,
  };

  if (params.status) where.status = params.status;

  if (params.start_date || params.end_date) {
    where.attendanceDate = {};
    if (params.start_date) where.attendanceDate.gte = new Date(params.start_date);
    if (params.end_date) where.attendanceDate.lte = new Date(params.end_date);
  }

  const [total, items] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      orderBy: { attendanceDate: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    data: items.map(serializeAttendance),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get paginated attendance logs
 */
const getLogs = async (userId, params = {}) => {
  const { personId, institutionId } = await resolveUserContext(userId);
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 20;
  const skip = (page - 1) * limit;

  const where = { personId, institutionId, isDeleted: false };
  if (params.action) where.action = params.action;
  if (params.status) where.status = params.status;
  if (params.start_date || params.end_date) {
    where.dateTime = {};
    if (params.start_date) where.dateTime.gte = new Date(params.start_date);
    if (params.end_date) where.dateTime.lte = new Date(params.end_date);
  }

  const [total, items] = await Promise.all([
    prisma.attendanceLog.count({ where }),
    prisma.attendanceLog.findMany({
      where,
      orderBy: { dateTime: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    data: items.map(serializeLog),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ==================== Helpers ====================

const resolveLocation = async (locationId, institutionId) => {
  if (!locationId) {
    // Auto-pick first active location for institution
    const loc = await prisma.mLocation.findFirst({
      where: { institutionId, isActive: true, isDeleted: false },
    });
    if (!loc) throw { status: 400, message: 'Tidak ada lokasi presensi aktif', code: ERROR_CODE.NO_ACTIVE_LOCATION };
    return loc;
  }
  const loc = await prisma.mLocation.findFirst({
    where: { id: Number(locationId), institutionId, isActive: true, isDeleted: false },
  });
  if (!loc) throw { status: 400, message: 'Lokasi presensi tidak valid', code: ERROR_CODE.INVALID_LOCATION };
  return loc;
};

const insertLog = async ({ institutionId, personId, action, attendanceType, attendanceId, latitude, longitude, distanceMeter, locationStatus, attendanceLocationId, photo, device, ipAddress, status, rejectionReason, now }) => {
  try {
    await prisma.attendanceLog.create({
      data: {
        institutionId,
        personId,
        dateTime: now || nowInTz(),
        attendanceId: attendanceId || null,
        attendanceType,
        action,
        attendanceLocationId: attendanceLocationId ? Number(attendanceLocationId) : null,
        photo: photo || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        distanceMeter: distanceMeter ? Number(distanceMeter) : null,
        locationStatus,
        device: device || null,
        ipAddress: ipAddress || null,
        status,
        rejectionReason: rejectionReason || null,
        createdAt: now || nowInTz(),
      },
    });
  } catch (e) {
    // Log errors should not break main flow for rejected attempts
    console.error('[AttendanceService] Failed to insert log:', e.message);
  }
};

const serializeAttendance = (a) => ({
  id: Number(a.id),
  institutionId: a.institutionId,
  personId: a.personId,
  attendanceType: a.attendanceType,
  attendanceDate: a.attendanceDate,
  checkinTime: a.checkinTime,
  checkoutTime: a.checkoutTime,
  checkinPhoto: storage.getUrl(a.checkinPhoto),
  checkoutPhoto: storage.getUrl(a.checkoutPhoto),
  checkinLatitude: a.checkinLatitude ? Number(a.checkinLatitude) : null,
  checkinLongitude: a.checkinLongitude ? Number(a.checkinLongitude) : null,
  checkinDistanceMeter: a.checkinDistanceMeter ? Number(a.checkinDistanceMeter) : null,
  checkoutLatitude: a.checkoutLatitude ? Number(a.checkoutLatitude) : null,
  checkoutLongitude: a.checkoutLongitude ? Number(a.checkoutLongitude) : null,
  checkoutDistanceMeter: a.checkoutDistanceMeter ? Number(a.checkoutDistanceMeter) : null,
  status: a.status,
  lateMinutes: a.lateMinutes,
  earlyLeaveMinutes: a.earlyLeaveMinutes,
  overtimeMinutes: a.overtimeMinutes,
  note: a.note,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const serializeLog = (l) => ({
  id: Number(l.id),
  dateTime: l.dateTime,
  action: l.action,
  attendanceType: l.attendanceType,
  photo: storage.getUrl(l.photo),
  latitude: l.latitude ? Number(l.latitude) : null,
  longitude: l.longitude ? Number(l.longitude) : null,
  distanceMeter: l.distanceMeter ? Number(l.distanceMeter) : null,
  locationStatus: l.locationStatus,
  status: l.status,
  rejectionReason: l.rejectionReason,
  device: l.device,
  createdAt: l.createdAt,
});

const serializeShift = (shift) => shift;

module.exports = {
  getTodayAttendance,
  getActiveLocations,
  checkIn,
  checkOut,
  getHistory,
  getLogs,
};
