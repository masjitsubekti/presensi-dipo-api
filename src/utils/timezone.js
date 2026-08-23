const moment = require('moment-timezone');

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

/**
 * Format any Date/timestamp to ISO 8601 string in APP_TIMEZONE (+07:00)
 * @param {Date|string|number|null} date
 * @returns {string|null} e.g. "2026-08-23T12:47:58+07:00"
 */
const formatTzISO = (date) => {
  if (!date) return null;
  const m = moment(date).tz(APP_TIMEZONE);
  if (!m.isValid()) return null;
  return m.format('YYYY-MM-DDTHH:mm:ssZ');
};

/**
 * Format any Date/timestamp to "YYYY-MM-DD HH:mm:ss" in APP_TIMEZONE
 * @param {Date|string|number|null} date
 * @returns {string|null} e.g. "2026-08-23 12:47:58"
 */
const formatTzString = (date) => {
  if (!date) return null;
  const m = moment(date).tz(APP_TIMEZONE);
  if (!m.isValid()) return null;
  return m.format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Get current Date object formatted to APP_TIMEZONE (WIB) wall-clock time
 * so Prisma/MySQL stores literal WIB wall-clock time (e.g. '2026-08-23 13:27:52') directly into DB columns.
 * @returns {Date}
 */
const nowInTz = () => {
  const wibStr = moment().tz(APP_TIMEZONE).format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
  return new Date(wibStr);
};

/**
 * Get today's date string in YYYY-MM-DD format in APP_TIMEZONE
 * @returns {string} e.g. "2026-08-23"
 */
const todayDateString = () => {
  return moment().tz(APP_TIMEZONE).format('YYYY-MM-DD');
};

/**
 * Get today's date at midnight (start of day) as a JS Date
 * @returns {Date}
 */
const todayStartUtc = () => {
  const dateStr = todayDateString();
  return new Date(`${dateStr}T00:00:00.000Z`);
};

/**
 * Parse a "HH:MM" string into minutes since midnight
 * @param {string} timeStr - e.g. "08:00"
 * @returns {number} minutes since midnight
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Get current time as minutes since midnight in APP_TIMEZONE
 * @returns {number}
 */
const currentMinutes = () => {
  const m = moment().tz(APP_TIMEZONE);
  return m.hours() * 60 + m.minutes();
};

/**
 * Calculate difference in minutes between two Date objects
 * @param {Date} dateA
 * @param {Date} dateB
 * @returns {number} dateB - dateA in minutes (positive = dateB is later)
 */
const diffMinutes = (dateA, dateB) => {
  return Math.round((new Date(dateB).getTime() - new Date(dateA).getTime()) / 60000);
};

module.exports = {
  APP_TIMEZONE,
  nowInTz,
  todayDateString,
  todayStartUtc,
  timeToMinutes,
  currentMinutes,
  diffMinutes,
  formatTzISO,
  formatTzString,
};
