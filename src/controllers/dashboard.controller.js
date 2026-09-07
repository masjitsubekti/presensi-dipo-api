const dashboardService = require('../services/dashboard.service');

/**
 * Dashboard Controller
 */

// 1. Executive Summary Endpoint
const getExecutiveSummary = async (req, res, next) => {
  try {
    const data = await dashboardService.getExecutiveSummary(req.query);

    return res.status(200).json({
      status: true,
      message: 'Berhasil mengambil data Ringkasan Eksekutif Dashboard',
      data,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Top 10 Pemantauan Keterlambatan Pegawai Endpoint
const getTopLateEmployees = async (req, res, next) => {
  try {
    const data = await dashboardService.getTopLateEmployees(req.query);

    return res.status(200).json({
      status: true,
      message: 'Berhasil mengambil data Top 10 Pemantauan Keterlambatan Pegawai',
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExecutiveSummary,
  getTopLateEmployees,
};
