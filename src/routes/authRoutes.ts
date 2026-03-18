import { Router } from 'express';
import { body } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import {
  register,
  login,
  googleAuth,
  getMe,
  updateProfile,
  changePassword,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again after 15 minutes.' },
});

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name required')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be 2–60 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

// Google: accepts either idToken (real GIS) or name+email+googleId (demo mode)
const googleRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('name').optional().trim().notEmpty(),
  body('idToken').optional().isString(),
  body('googleId').optional().isString(),
  body('avatar').optional().isURL(),
];

const profileRules = [
  body('name').optional().trim().isLength({ min: 2, max: 60 }),
  body('phone').optional().matches(/^[0-9]{10}$/),
];

const changePwRules = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password min 6 chars'),
];

// ── Public
router.post('/register',        authLimiter, registerRules, register);
router.post('/login',           authLimiter, loginRules,    login);
router.post('/google',          authLimiter, googleRules,   googleAuth);

// ── Protected
router.get ('/me',              authenticate, getMe);
router.put ('/profile',         authenticate, profileRules,  updateProfile);
router.put ('/change-password', authenticate, changePwRules, changePassword);

export default router;