const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');

const institutionController = require('../controllers/institution.controller');
const levelController = require('../controllers/level.controller');
const positionController = require('../controllers/position.controller');
const departmentController = require('../controllers/department.controller');
const personController = require('../controllers/person.controller');
const workTimeController = require('../controllers/work-time.controller');
const workShiftController = require('../controllers/work-shift.controller');
const workShiftPatternController = require('../controllers/work-shift-pattern.controller');
const attendanceTypeController = require('../controllers/attendance-type.controller');
const holidayController = require('../controllers/holiday.controller');
const locationController = require('../controllers/location.controller');

router.use(authenticate);

// ==================== Master: Institution ====================
router.get('/institution/all', institutionController.all);
router.get('/institution', institutionController.index);
router.post('/institution', institutionController.store);
router.get('/institution/:id', institutionController.show);
router.put('/institution/:id', institutionController.update);
router.delete('/institution/:id', institutionController.destroy);

// ==================== Master: Level ====================
router.get('/level/all', levelController.all);
router.get('/level', levelController.index);
router.get('/level/:id', levelController.show);

// ==================== Master: Position ====================
router.get('/position/all', positionController.all);
router.get('/position', positionController.index);
router.post('/position', positionController.store);
router.get('/position/:id', positionController.show);
router.put('/position/:id', positionController.update);
router.delete('/position/:id', positionController.destroy);

// ==================== Master: Department ====================
router.get('/department/all', departmentController.all);
router.get('/department', departmentController.index);
router.post('/department', departmentController.store);
router.get('/department/:id', departmentController.show);
router.put('/department/:id', departmentController.update);
router.delete('/department/:id', departmentController.destroy);

// ==================== Master: Person ====================
router.get('/person/all', personController.all);
router.get('/person', personController.index);
router.post('/person', personController.store);
router.get('/person/:id', personController.show);
router.put('/person/:id', personController.update);
router.delete('/person/:id', personController.destroy);

// ==================== Master: Work Time ====================
router.get('/work-time/all', workTimeController.all);
router.get('/work-time', workTimeController.index);
router.post('/work-time', workTimeController.store);
router.get('/work-time/:id', workTimeController.show);
router.put('/work-time/:id', workTimeController.update);
router.delete('/work-time/:id', workTimeController.destroy);

// ==================== Master: Work Shift ====================
router.get('/work-shift/all', workShiftController.all);
router.get('/work-shift', workShiftController.index);
router.post('/work-shift', workShiftController.store);
router.get('/work-shift/:id', workShiftController.show);
router.put('/work-shift/:id', workShiftController.update);
router.delete('/work-shift/:id', workShiftController.destroy);

// ==================== Master: Work Shift Pattern ====================
router.get('/work-shift-pattern/all', workShiftPatternController.all);
router.get('/work-shift-pattern', workShiftPatternController.index);
router.post('/work-shift-pattern', workShiftPatternController.store);
router.get('/work-shift-pattern/:id', workShiftPatternController.show);
router.put('/work-shift-pattern/:id', workShiftPatternController.update);
router.delete('/work-shift-pattern/:id', workShiftPatternController.destroy);

// ==================== Master: Attendance Type ====================
router.get('/attendance-type/all', attendanceTypeController.all);
router.get('/attendance-type', attendanceTypeController.index);
router.post('/attendance-type', attendanceTypeController.store);
router.get('/attendance-type/:id', attendanceTypeController.show);
router.put('/attendance-type/:id', attendanceTypeController.update);
router.delete('/attendance-type/:id', attendanceTypeController.destroy);

// ==================== Master: Holiday ====================
router.get('/holiday/all', holidayController.all);
router.get('/holiday', holidayController.index);
router.post('/holiday', holidayController.store);
router.get('/holiday/:id', holidayController.show);
router.put('/holiday/:id', holidayController.update);
router.delete('/holiday/:id', holidayController.destroy);

// ==================== Master: Location ====================
router.get('/location/all', locationController.all);
router.get('/location', locationController.index);
router.post('/location', locationController.store);
router.get('/location/:id', locationController.show);
router.put('/location/:id', locationController.update);
router.delete('/location/:id', locationController.destroy);

module.exports = router;
