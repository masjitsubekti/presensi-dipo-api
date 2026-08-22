const router = require('express').Router();

// Import all route modules
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const roleRoutes = require('./role.routes');
const menuRoutes = require('./menu.routes');
const menuRoleRoutes = require('./menu-role.routes');
const appConfigRoutes = require('./app-config.routes');
const institutionRoutes = require('./institution.routes');
const levelRoutes = require('./level.routes');
const positionRoutes = require('./position.routes');
const departmentRoutes = require('./department.routes');
const personRoutes = require('./person.routes');
const workTimeRoutes = require('./work-time.routes');
const workShiftRoutes = require('./work-shift.routes');
const workShiftPatternRoutes = require('./work-shift-pattern.routes');

// ==================== Health ====================
router.use('/health', healthRoutes);

// ==================== Auth (dual prefix: /auth and /user) ====================
router.use('/auth', authRoutes);
router.use('/user', authRoutes); 
router.use('/user', userRoutes); 
router.use('/roles', roleRoutes);

// Menu
router.use('/menu', menuRoutes);
router.use('/menu-role', menuRoleRoutes);

// App Config
router.use('/app-config', appConfigRoutes);

// Master Data
router.use('/master/institution', institutionRoutes);
router.use('/master/level', levelRoutes);
router.use('/master/position', positionRoutes);
router.use('/master/department', departmentRoutes);
router.use('/master/person', personRoutes);
router.use('/master/work-time', workTimeRoutes);
router.use('/master/work-shift', workShiftRoutes);
router.use('/master/work-shift-pattern', workShiftPatternRoutes);

module.exports = router;
