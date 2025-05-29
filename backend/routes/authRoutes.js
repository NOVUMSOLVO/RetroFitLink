const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Registration and login routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);

// Password management
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);

// MFA routes
router.post('/mfa/setup', authenticate, authController.setupMfa);
router.post('/mfa/verify', authenticate, authController.verifyMfaSetup);
router.post('/mfa/disable', authenticate, authController.disableMfa);
router.post('/mfa/validate', authController.validateMfaToken);
router.post('/mfa/backup', authController.validateBackupCode);

module.exports = router;