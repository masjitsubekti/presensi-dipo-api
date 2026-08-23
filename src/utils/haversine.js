/**
 * Haversine Distance Calculator
 * Calculates the great-circle distance between two GPS coordinates in meters.
 *
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters (rounded to 2 decimal places)
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
};

/**
 * Check if a GPS coordinate is within a radius of a center point
 *
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {number} userLat
 * @param {number} userLon
 * @param {number} radiusMeter
 * @returns {{ distance: number, isWithin: boolean }}
 */
const checkWithinRadius = (centerLat, centerLon, userLat, userLon, radiusMeter) => {
  const distance = haversineDistance(
    Number(centerLat),
    Number(centerLon),
    Number(userLat),
    Number(userLon)
  );

  // If radiusMeter is 0, null, or undefined, location radius check is ignored (unrestricted)
  const isNoRadiusLimit = radiusMeter === 0 || radiusMeter === null || radiusMeter === undefined;
  const isWithin = isNoRadiusLimit || distance <= Number(radiusMeter);

  return {
    distance,
    isWithin,
  };
};

module.exports = { haversineDistance, checkWithinRadius };
