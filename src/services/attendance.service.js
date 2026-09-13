require('dotenv').config();
const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');
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
      attendanceType: ATTENDANCE_TYPE.REGULAR,
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
    if (isCheckoutWindowActive) {
      canCheckin = false;
      canCheckout = true;
    } else {
      canCheckin = true;
      canCheckout = false;
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
 * Helper to get exact ISO-8601 dayOfWeek number for querying (1 = Mon, 2 = Tue, ..., 7 = Sun).
 */
const getIsoDayOfWeek = (date) => {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return jsDay === 0 ? 7 : jsDay;
};

/**
 * Get the active work shift for a person on a given date
 */
const getActiveShiftForToday = async (personId, date) => {
  const dateOnly = new Date(date.toDateString());
  const isoDay = getIsoDayOfWeek(date);

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
            where: { isDeleted: false },
            include: { workTime: true },
          },
        },
      },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!pattern?.shift) return null;

  // Match exact dayOfWeek (ISO day 1-7 or fallback JS day 0-6)
  const detail = pattern.shift.details.find((d) => d.dayOfWeek === isoDay)
    ?? pattern.shift.details.find((d) => d.dayOfWeek === date.getDay());

  if (!detail) return null;

  return {
    shiftId: pattern.shiftId,
    shiftName: pattern.shift.name,
    dayOfWeek: detail.dayOfWeek,
    isWorkingDay: Boolean(detail.isWorkingDay),
    workTime: (Boolean(detail.isWorkingDay) && detail.workTime)
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
      attendanceType: ATTENDANCE_TYPE.REGULAR,
      isDeleted: false,
    },
  });

  if (existing?.checkinTime) {
    // Location validation first for re-checkin
    if (!isWithin) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.REGULAR,
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
      ? await storage.uploadFile(photoBuffer, photoMimeType, 'attendance/checkin', 'checkin')
      : null;

    await insertLog({
      institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.REGULAR,
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
      institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.REGULAR,
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
        institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.REGULAR,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKIN_NOT_ALLOWED,
        attendanceLocationId, device, ipAddress, now,
      });
      throw { status: 400, message: `Presensi masuk belum dibuka. Jam masuk: ${wt.checkinStart} – ${wt.checkinEnd}`, code: ERROR_CODE.CHECKIN_NOT_ALLOWED };
    }

    if (wt.checkinEnd && nowMinutes > timeToMinutes(wt.checkinEnd)) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKIN, attendanceType: ATTENDANCE_TYPE.REGULAR,
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
    ? await storage.uploadFile(photoBuffer, photoMimeType, 'attendance/checkin', 'checkin')
    : null;

  // 7. Transaction: insert log + create/update attendance
  const result = await prisma.$transaction(async (tx) => {
    // Create attendance
    const attendance = await tx.attendance.create({
      data: {
        institutionId,
        personId,
        attendanceType: ATTENDANCE_TYPE.REGULAR,
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
        attendanceType: ATTENDANCE_TYPE.REGULAR,
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
      attendanceType: ATTENDANCE_TYPE.REGULAR,
      isDeleted: false,
    },
  });


  // Note: Re-checkout is allowed to update checkoutTime and checkoutPhoto to the latest time

  // 4. Location validation
  if (!isWithin) {
    await insertLog({
      institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.REGULAR,
      latitude, longitude, distanceMeter: distance, locationStatus,
      status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.OUT_OF_RADIUS,
      attendanceId: existing?.id ?? null, attendanceLocationId, device, ipAddress, now,
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
        institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.REGULAR,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKOUT_NOT_ALLOWED,
        attendanceId: existing?.id ?? null, attendanceLocationId, device, ipAddress, now,
      });
      throw { status: 400, message: `Presensi pulang belum dibuka. Jam pulang: ${wt.checkoutStart} – ${wt.checkoutEnd}`, code: ERROR_CODE.CHECKOUT_NOT_ALLOWED };
    }

    if (wt.checkoutEnd && nowMinutes > timeToMinutes(wt.checkoutEnd)) {
      await insertLog({
        institutionId, personId, action: LOG_ACTION.CHECKOUT, attendanceType: ATTENDANCE_TYPE.REGULAR,
        latitude, longitude, distanceMeter: distance, locationStatus,
        status: LOG_STATUS.REJECTED, rejectionReason: ERROR_CODE.CHECKOUT_NOT_ALLOWED,
        attendanceId: existing?.id ?? null, attendanceLocationId, device, ipAddress, now,
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
    ? await storage.uploadFile(photoBuffer, photoMimeType, 'attendance/checkout', 'checkout')
    : null;

  // 7. Transaction: insert log + update attendance
  const result = await prisma.$transaction(async (tx) => {
    let attendanceRecord;
    if (existing) {
      attendanceRecord = await tx.attendance.update({
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
          status: existing.status || (isNonWorkingDay ? ATTENDANCE_STATUS.PRESENT : ATTENDANCE_STATUS.LATE),
          updatedAt: now,
          updatedBy: userId,
        },
      });
    } else {
      attendanceRecord = await tx.attendance.create({
        data: {
          institutionId,
          personId,
          attendanceType: ATTENDANCE_TYPE.REGULAR,
          attendanceDate: new Date(today),
          checkinTime: null,
          checkoutTime: now,
          checkoutPhoto: photoPath,
          checkoutLocationId: location.id,
          checkoutLatitude: Number(latitude),
          checkoutLongitude: Number(longitude),
          checkoutDistanceMeter: distance,
          status: isNonWorkingDay ? ATTENDANCE_STATUS.PRESENT : ATTENDANCE_STATUS.LATE,
          earlyLeaveMinutes,
          overtimeMinutes,
          createdAt: now,
          createdBy: userId,
        },
      });
    }

    await tx.attendanceLog.create({
      data: {
        institutionId,
        personId,
        dateTime: now,
        attendanceId: attendanceRecord.id,
        attendanceType: ATTENDANCE_TYPE.REGULAR,
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

    return attendanceRecord;
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
    attendanceType: params.attendance_type || ATTENDANCE_TYPE.REGULAR,
    isDeleted: false,
  };

  if (params.status) where.status = params.status;

  if (params.start_date || params.end_date) {
    where.attendanceDate = {};
    if (params.start_date) where.attendanceDate.gte = new Date(params.start_date);
    if (params.end_date) where.attendanceDate.lte = new Date(params.end_date);
  }

  const [total, items, locations] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      orderBy: { attendanceDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.mLocation.findMany({
      where: { institutionId, isDeleted: false },
    }),
  ]);

  const locationMap = new Map(locations.map((loc) => [loc.id, loc.name]));

  const data = items.map((att) => {
    const serialized = serializeAttendance(att);
    const inLocName = att.checkinLocationId ? locationMap.get(att.checkinLocationId) : null;
    const outLocName = att.checkoutLocationId ? locationMap.get(att.checkoutLocationId) : null;
    const defaultLocName = locations.length > 0 ? locations[0].name : null;
    serialized.checkinLocationName = inLocName || defaultLocName;
    serialized.checkoutLocationName = outLocName || defaultLocName;
    serialized.locationName = inLocName || outLocName || defaultLocName;
    return serialized;
  });

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const LOG_SORT_MAP = {
  id: 'a.id',
  institutionId: 'a.institution_id',
  institution_id: 'a.institution_id',
  institutionName: 'inst.name',
  institution_name: 'inst.name',
  personId: 'a.person_id',
  person_id: 'a.person_id',
  personName: 'p.name',
  person_name: 'p.name',
  person: 'p.name',
  personNip: 'p.nip',
  person_nip: 'p.nip',
  nip: 'p.nip',
  departmentId: 'p.department_id',
  department_id: 'p.department_id',
  departmentName: 'd.name',
  department_name: 'd.name',
  department: 'd.name',
  positionId: 'p.position_id',
  position_id: 'p.position_id',
  positionName: 'pos.name',
  position_name: 'pos.name',
  position: 'pos.name',
  attendanceType: 'a.attendance_type',
  attendance_type: 'a.attendance_type',
  attendanceDate: 'a.attendance_date',
  attendance_date: 'a.attendance_date',
  dateTime: 'a.attendance_date',
  date_time: 'a.attendance_date',
  date: 'a.attendance_date',
  checkinTime: 'a.checkin_time',
  checkin_time: 'a.checkin_time',
  checkoutTime: 'a.checkout_time',
  checkout_time: 'a.checkout_time',
  checkinLocationName: 'loc_in.name',
  checkin_location_name: 'loc_in.name',
  checkoutLocationName: 'loc_out.name',
  checkout_location_name: 'loc_out.name',
  status: 'a.status',
  teachingStatus: 'a.teaching_status',
  teaching_status: 'a.teaching_status',
  lateMinutes: 'a.late_minutes',
  late_minutes: 'a.late_minutes',
  earlyLeaveMinutes: 'a.early_leave_minutes',
  early_leave_minutes: 'a.early_leave_minutes',
  overtimeMinutes: 'a.overtime_minutes',
  overtime_minutes: 'a.overtime_minutes',
  note: 'a.note',
  createdAt: 'a.created_at',
  created_at: 'a.created_at',
};

const selectAttendanceDTOQuery = `
  SELECT 
    a.id,
    a.institution_id AS institutionId,
    inst.name AS institutionName,
    a.person_id AS personId,
    p.name AS personName,
    p.nip AS personNip,
    d.id AS departmentId,
    d.name AS departmentName,
    pos.id AS positionId,
    pos.name AS positionName,
    a.attendance_type AS attendanceType,
    a.attendance_date AS attendanceDate,
    a.checkin_time AS checkinTime,
    a.checkout_time AS checkoutTime,
    a.checkin_photo AS checkinPhoto,
    a.checkout_photo AS checkoutPhoto,
    a.checkin_location_id AS checkinLocationId,
    loc_in.name AS checkinLocationName,
    a.checkin_latitude AS checkinLatitude,
    a.checkin_longitude AS checkinLongitude,
    a.checkin_distance_meter AS checkinDistanceMeter,
    a.checkout_location_id AS checkoutLocationId,
    loc_out.name AS checkoutLocationName,
    a.checkout_latitude AS checkoutLatitude,
    a.checkout_longitude AS checkoutLongitude,
    a.checkout_distance_meter AS checkoutDistanceMeter,
    a.status,
    a.teaching_status AS teachingStatus,
    a.mode,
    a.attendance_type_id AS attendanceTypeId,
    at.name AS attendanceTypeName,
    at.code AS attendanceTypeCode,
    at.color_label AS attendanceTypeColorLabel,
    a.late_minutes AS lateMinutes,
    a.early_leave_minutes AS earlyLeaveMinutes,
    a.overtime_minutes AS overtimeMinutes,
    a.note,
    a.created_at AS createdAt
  FROM attendances a
  LEFT JOIN m_person p ON a.person_id = p.id
  LEFT JOIN m_department d ON p.department_id = d.id
  LEFT JOIN m_position pos ON p.position_id = pos.id
  LEFT JOIN m_institution inst ON a.institution_id = inst.id
  LEFT JOIN m_attendance_type at ON a.attendance_type_id = at.id
  LEFT JOIN m_location loc_in ON a.checkin_location_id = loc_in.id
  LEFT JOIN m_location loc_out ON a.checkout_location_id = loc_out.id
`;

/**
 * Resolve paginated attendance records from attendances table (matching institution.service.js pattern)
 * Supports params: pageNumber, pageSize, q, sortBy, sortType, personId, institutionId, departmentId, positionId, attendanceType, status, startDate, endDate
 */
const resolveAll = async (params = {}, userId = null) => {
  let ctxInstitutionId = null;
  if (userId) {
    const user = await prisma.authUser.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (user && user.institutionId) {
      ctxInstitutionId = Number(user.institutionId);
    }
  }

  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const parseBoolean = (val, defaultVal = false) => {
    if (val === null || val === undefined) return defaultVal;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') return val === 'true' || val === '1';
    return Boolean(val);
  };
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const keyword = params.q ?? null;
  const status = params.status ?? null;
  const mode = params.mode ?? null;
  const attendanceType = params.attendanceType ?? params.attendance_type ?? null;
  const departmentId = params.departmentId ?? params.department_id ?? null;
  const positionId = params.positionId ?? params.position_id ?? null;
  const personId = params.personId ?? params.person_id ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const startDate = params.startDate ?? params.start_date ?? null;
  const endDate = params.endDate ?? params.end_date ?? null;

  const sortBy = LOG_SORT_MAP[params.sortBy] ?? 'a.attendance_date';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['a.is_deleted = 0'];
  const values = [];

  if (mode) {
    conditions.push('a.mode = ?');
    values.push(mode);
  }

  // Institution scope filter (allow filter by institutionId or scope to user's institution if assigned)
  if (institutionId) {
    conditions.push('a.institution_id = ?');
    values.push(Number(institutionId));
  } else if (ctxInstitutionId) {
    conditions.push('a.institution_id = ?');
    values.push(ctxInstitutionId);
  }

  if (personId) {
    conditions.push('a.person_id = ?');
    values.push(Number(personId));
  }

  if (departmentId) {
    conditions.push('p.department_id = ?');
    values.push(Number(departmentId));
  }

  if (positionId) {
    conditions.push('p.position_id = ?');
    values.push(Number(positionId));
  }

  if (attendanceType) {
    conditions.push('a.attendance_type = ?');
    values.push(attendanceType);
  }

  if (status) {
    conditions.push('a.status = ?');
    values.push(status);
  }

  if (startDate) {
    conditions.push('a.attendance_date >= ?');
    values.push(`${startDate}`);
  }

  if (endDate) {
    conditions.push('a.attendance_date <= ?');
    values.push(`${endDate}`);
  }

  if (keyword) {
    conditions.push('CONCAT(IFNULL(p.name,""), IFNULL(p.nip,""), IFNULL(d.name,""), IFNULL(a.attendance_type,""), IFNULL(a.status,"")) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  // Exec Count Subquery
  const countSql = `SELECT COUNT(*) AS total FROM (${selectAttendanceDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  // Exec Data Query
  let dataSql = `
    ${selectAttendanceDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
  `;

  let items;
  if (ignorePaging) {
    items = await prisma.$queryRawUnsafe(dataSql, ...values);
  } else {
    dataSql += ` LIMIT ? OFFSET ?`;
    items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);
  }

  const formattedItems = (items || []).map((item) => ({
    ...item,
    id: Number(item.id),
    personId: Number(item.personId),
    institutionId: Number(item.institutionId),
    departmentId: item.departmentId ? Number(item.departmentId) : null,
    checkinLocationId: item.checkinLocationId ? Number(item.checkinLocationId) : null,
    checkoutLocationId: item.checkoutLocationId ? Number(item.checkoutLocationId) : null,
    checkinLatitude: item.checkinLatitude ? Number(item.checkinLatitude) : null,
    checkinLongitude: item.checkinLongitude ? Number(item.checkinLongitude) : null,
    checkinDistanceMeter: item.checkinDistanceMeter ? Number(item.checkinDistanceMeter) : null,
    checkoutLatitude: item.checkoutLatitude ? Number(item.checkoutLatitude) : null,
    checkoutLongitude: item.checkoutLongitude ? Number(item.checkoutLongitude) : null,
    checkoutDistanceMeter: item.checkoutDistanceMeter ? Number(item.checkoutDistanceMeter) : null,
    checkinPhoto: storage.getUrl(item.checkinPhoto),
    checkoutPhoto: storage.getUrl(item.checkoutPhoto),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getLogs = async (userId, params = {}) => resolveAll(params, userId);

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
  checkinLocationName: a.checkinLocation?.name ?? null,
  checkoutLocationName: a.checkoutLocation?.name ?? null,
  locationName: a.checkinLocation?.name ?? a.checkoutLocation?.name ?? null,
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
  resolveAll,
};
