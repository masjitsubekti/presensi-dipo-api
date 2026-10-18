const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const workShiftPatternService = require('../services/work-shift-pattern.service');
const response = require('../helpers/response.helper');
const prisma = require('../config/prisma');

/**
 * Helper to resolve institutionId from explicit parameter (query/body) first, fallback to user session
 */
const resolveInstitutionId = (user, explicitId) => {
  if (explicitId !== undefined && explicitId !== null && explicitId !== '') {
    return Number(explicitId);
  }
  if (user?.institutionId) {
    return Number(user.institutionId);
  }
  return null;
};

/** GET /v1/master/work-shift-pattern */
exports.index = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const result = await workShiftPatternService.resolveAll(params);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-shift-pattern/all */
exports.all = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const data = await workShiftPatternService.getAll(params);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-shift-pattern/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await workShiftPatternService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/work-shift-pattern */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('effectiveFrom').notEmpty().withMessage('Tanggal Efektif (effectiveFrom) wajib diisi'),
    ]);

    const hasSingleShift = req.body.shiftId || req.body.shift_id;
    const hasBulkShift = (Array.isArray(req.body.shiftIds) && req.body.shiftIds.length > 0) ||
                          (Array.isArray(req.body.shift_ids) && req.body.shift_ids.length > 0);

    if (!hasSingleShift && !hasBulkShift) {
      return response.error(res, 'Shift (shiftId / shiftIds) wajib diisi', 400);
    }

    const hasSinglePerson = req.body.personId || req.body.person_id;
    const hasBulkPerson = (Array.isArray(req.body.personIds) && req.body.personIds.length > 0) ||
                          (Array.isArray(req.body.person_ids) && req.body.person_ids.length > 0);

    if (!hasSinglePerson && !hasBulkPerson) {
      return response.error(res, 'Pegawai (personId / personIds) wajib diisi', 400);
    }

    if (req.user?.institutionId) {
      const personIds = (Array.isArray(req.body.personIds ?? req.body.person_ids)
        ? (req.body.personIds ?? req.body.person_ids)
        : [req.body.personId ?? req.body.person_id]).map(Number).filter(Boolean);

      const invalidCount = await prisma.mPerson.count({
        where: {
          id: { in: personIds },
          institutionId: { not: Number(req.user.institutionId) },
          isDeleted: false,
        },
      });

      if (invalidCount > 0) {
        return response.error(res, 'Anda tidak memiliki hak akses untuk menugaskan pegawai dari institusi lain', 403);
      }
    }

    const data = await workShiftPatternService.create(req.body, req.user);
    return response.success(res, data, 'Penugasan Jam Kerja berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/work-shift-pattern/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('shiftId').notEmpty().withMessage('Shift (shiftId) wajib diisi'),
      body('effectiveFrom').notEmpty().withMessage('Tanggal Efektif (effectiveFrom) wajib diisi'),
    ]);

    const targetPersonId = req.body.personId || req.body.person_id;
    if (!targetPersonId) {
      return response.error(res, 'Pegawai (personId) wajib diisi', 400);
    }

    const current = await workShiftPatternService.resolveById(req.params.id);

    // Cegah Admin Sekolah mengubah penugasan pegawai milik institusi lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk mengubah penugasan jam kerja pegawai institusi lain', 403);
    }

    if (req.user?.institutionId && targetPersonId) {
      const targetPerson = await prisma.mPerson.findUnique({
        where: { id: Number(targetPersonId) },
        select: { institutionId: true },
      });
      if (targetPerson && targetPerson.institutionId !== Number(req.user.institutionId)) {
        return response.error(res, 'Anda tidak memiliki hak akses untuk menugaskan pegawai dari institusi lain', 403);
      }
    }

    const data = await workShiftPatternService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Penugasan Jam Kerja berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/work-shift-pattern/:id */
exports.destroy = async (req, res, next) => {
  try {
    const current = await workShiftPatternService.resolveById(req.params.id);

    // Cegah Admin Sekolah menghapus penugasan pegawai milik institusi lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk menghapus penugasan jam kerja pegawai institusi lain', 403);
    }

    await workShiftPatternService.remove(req.params.id);
    return response.success(res, null, 'Penugasan Jam Kerja berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

