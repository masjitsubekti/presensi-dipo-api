const reportService = require('../services/report.service');

/**
 * Report Controller
 */

const getEmployeeRecap = async (req, res, next) => {
  try {
    const { personId, person_id, month, year, startDate, start_date, endDate, end_date, institutionId, institution_id } = req.query;
    
    const targetPersonId = personId || person_id;
    if (!targetPersonId) {
      return res.status(400).json({
        status: false,
        message: 'Query parameter personId wajib diisi',
      });
    }

    const data = await reportService.getEmployeeRecap(
      {
        personId: targetPersonId,
        month,
        year,
        startDate: startDate || start_date,
        endDate: endDate || end_date,
        institutionId: institutionId || institution_id,
      },
      req.user
    );

    return res.status(200).json({
      status: true,
      message: 'Berhasil mengambil data Rekap Presensi Pegawai',
      data,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        status: false,
        message: error.message,
      });
    }
    next(error);
  }
};

const getEmployeeSummary = async (req, res, next) => {
  try {
    const data = await reportService.getEmployeeSummary(req.query, req.user);

    return res.status(200).json({
      status: true,
      message: 'Berhasil mengambil data Rekapitulasi Presensi Pegawai',
      data,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        status: false,
        message: error.message,
      });
    }
    next(error);
  }
};

module.exports = {
  getEmployeeRecap,
  getEmployeeSummary,
};
