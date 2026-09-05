const reportService = require('../services/report.service');

/**
 * Report Controller
 */

const getEmployeeRecap = async (req, res, next) => {
  try {
    const { personId, person_id, month, year, institutionId, institution_id } = req.query;
    
    const targetPersonId = personId || person_id;
    if (!targetPersonId) {
      return res.status(400).json({
        status: false,
        message: 'Query parameter personId wajib diisi',
      });
    }

    const data = await reportService.getEmployeeRecap({
      personId: targetPersonId,
      month,
      year,
      institutionId: institutionId || institution_id,
    });

    return res.status(200).json({
      status: true,
      message: 'Berhasil mengambil data Rekap Presensi Pegawai',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getEmployeeSummary = async (req, res, next) => {
  try {
    const data = await reportService.getEmployeeSummary(req.query);

    return res.status(200).json({
      status: true,
      message: 'Berhasil mengambil data Rekapitulasi Presensi Pegawai',
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEmployeeRecap,
  getEmployeeSummary,
};
