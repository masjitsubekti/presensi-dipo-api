const router = require('express').Router();

// Import all route modules
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const roleRoutes = require('./role.routes');
const menuRoutes = require('./menu.routes');
const menuRoleRoutes = require('./menu-role.routes');
const appConfigRoutes = require('./app-config.routes');
const masterRoutes = require('./master.routes');
const attendanceRoutes = require('./attendance.routes');
const attendanceRequestRoutes = require('./attendance-request.routes');
const manualAttendanceRoutes = require('./manual-attendance.routes');
const reportRoutes = require('./report.routes');
const dashboardRoutes = require('./dashboard.routes');
const fileRoutes = require('./file.routes');

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
router.use('/master', masterRoutes);

// ==================== Attendance & Requests ====================
router.use('/attendance', attendanceRoutes);
router.use('/attendance-request', attendanceRequestRoutes);
router.use('/attendance-manual', manualAttendanceRoutes);

// ==================== Dashboard, Report & Files ====================
router.use('/dashboard', dashboardRoutes);
router.use('/report', reportRoutes);
router.use('/files', fileRoutes);

module.exports = router;
