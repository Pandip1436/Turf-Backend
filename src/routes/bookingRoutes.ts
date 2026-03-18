import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getSlots,
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  updatePayment,
} from '../controllers/bookingController';
import { authenticate, optionalAuth } from '../middleware/auth';

const router = Router();

// ── Validation rules
const slotQueryRules = [
  query('date').isDate().withMessage('Date must be YYYY-MM-DD'),
];

const createRules = [
  body('userName').trim().notEmpty().withMessage('Name required'),
  body('userEmail').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('userPhone').matches(/^[0-9]{10}$/).withMessage('10-digit phone required'),
  body('date').isDate().withMessage('Date must be YYYY-MM-DD'),
  body('timeSlots').isArray({ min: 1 }).withMessage('At least one slot required'),
  body('sport').optional().isIn(['football', 'cricket', 'both']),
  body('teamSize').optional().isInt({ min: 1, max: 30 }),
];

const paymentRules = [
  body('razorpayPaymentId').notEmpty().withMessage('Payment ID required'),
  body('razorpayOrderId').notEmpty().withMessage('Order ID required'),
];

// ── Routes
router.get ('/',             optionalAuth, slotQueryRules, getSlots);
router.get ('/slots',        optionalAuth, slotQueryRules, getSlots);
router.post('/',             optionalAuth, createRules,    createBooking);
router.get ('/my',           authenticate,                 getMyBookings);
router.get ('/:id',          optionalAuth,                 getBookingById);
router.patch('/:id/cancel',  authenticate,                 cancelBooking);
router.patch('/:id/payment', authenticate, paymentRules,   updatePayment);

export default router;
