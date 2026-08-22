const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const userController = require('../controllers/user.controller');
const authController = require('../controllers/auth.controller');

router.use(authenticate);

router.get('/', userController.index);
router.get('/all', userController.all);
router.get('/me', authController.me);
router.get('/:id', userController.show);
router.post('/', userController.store);
router.put('/active-status/:id', userController.updateActiveStatus);
router.put('/fcm-token/:id', userController.updateFcmToken);
router.put('/password/:id', authController.changePassword);
router.put('/:id', userController.update);
router.delete('/:id', userController.destroy);

module.exports = router;
