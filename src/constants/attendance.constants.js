/**
 * Attendance Module Constants
 * Centralized enums — DO NOT hardcode these strings elsewhere
 */

const ATTENDANCE_TYPE = {
  REGULAR: 'regular',
  TEACHING: 'teaching',
  OFFICE: 'regular',
};

const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent',
  LEAVE: 'leave',
  HOLIDAY: 'holiday',
  INCOMPLETE: 'incomplete',
};

const LOG_ACTION = {
  CHECKIN: 'checkin',
  CHECKOUT: 'checkout',
};

const LOG_STATUS = {
  SUCCESS: 'success',
  REJECTED: 'rejected',
  FAILED: 'failed',
};

const LOCATION_STATUS = {
  VALID: 'valid',
  OUT_OF_RADIUS: 'out_of_radius',
  GPS_ERROR: 'gps_error',
  LOCATION_DENIED: 'location_denied',
};

const ERROR_CODE = {
  OUT_OF_RADIUS: 'OUT_OF_RADIUS',
  CHECKIN_NOT_ALLOWED: 'CHECKIN_NOT_ALLOWED',
  CHECKOUT_NOT_ALLOWED: 'CHECKOUT_NOT_ALLOWED',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
  ALREADY_CHECKED_OUT: 'ALREADY_CHECKED_OUT',
  LOCATION_DENIED: 'LOCATION_DENIED',
  GPS_ERROR: 'GPS_ERROR',
  PHOTO_REQUIRED: 'PHOTO_REQUIRED',
  NO_ACTIVE_SHIFT: 'NO_ACTIVE_SHIFT',
  HOLIDAY: 'HOLIDAY',
  NOT_WORKING_DAY: 'NOT_WORKING_DAY',
  NO_ACTIVE_LOCATION: 'NO_ACTIVE_LOCATION',
  CHECKIN_REQUIRED: 'CHECKIN_REQUIRED',
  INVALID_LOCATION: 'INVALID_LOCATION',
};

const PHOTO_MAX_SIZE_MB = 5; // max 5 MB
const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MONTH_NAMES = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

const DAY_NAMES = [
  'MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'
];

module.exports = {
  ATTENDANCE_TYPE,
  ATTENDANCE_STATUS,
  LOG_ACTION,
  LOG_STATUS,
  LOCATION_STATUS,
  ERROR_CODE,
  PHOTO_MAX_SIZE_MB,
  PHOTO_ALLOWED_TYPES,
  MONTH_NAMES,
  DAY_NAMES,
};
