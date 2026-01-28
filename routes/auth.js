const express = require('express');
const { brandRegistration, login, verifyEmail, forgotPassword, resetPassword, UserRegister } = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

// Public routes
router.post('/register',authenticateToken, brandRegistration);
router.post('/login', login);
router.post('/user-register', UserRegister);
// router.post('/verify-email', verifyEmail);
// router.post('/forgot-password', forgotPassword);
// router.post('/reset-password', resetPassword);

module.exports = router;
