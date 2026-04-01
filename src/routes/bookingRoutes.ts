import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getSlots,
  createBooking,
  reserveBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  updatePayment,
} from '../controllers/bookingController';
import { authenticate, optionalAuth } from '../middleware/auth';

const router = Router();

// ── Validation rules ─────────────────────────────────────────────────────────

const slotQueryRules = [
  query('date').isDate().withMessage('Date must be YYYY-MM-DD'),
  // turfId is optional — if omitted, global availability is returned
  query('turfId').optional().isString().trim(),
];

const createRules = [
  body('userName').trim().notEmpty().withMessage('Name required'),
  body('userEmail').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('userPhone').matches(/^[0-9]{10}$/).withMessage('10-digit phone required'),
  body('date').isDate().withMessage('Date must be YYYY-MM-DD'),
  body('timeSlots').isArray({ min: 1 }).withMessage('At least one slot required'),
  body('sport').optional().isIn(['football', 'cricket', 'badminton', 'both']),
  body('turfId').optional().isString().trim(),    // e.g. 'thunder-arena'
  body('turfName').optional().isString().trim(),  // e.g. 'Thunder Arena'
  body('teamSize').optional().isInt({ min: 1, max: 30 }),
];

const paymentRules = [
  body('razorpayPaymentId').notEmpty().withMessage('Payment ID required'),
  body('razorpayOrderId').notEmpty().withMessage('Order ID required'),
];

// ── Routes ───────────────────────────────────────────────────────────────────

// Slots endpoint — optionalAuth so logged-in users see their own bookings highlighted
router.get('/slots', optionalAuth, slotQueryRules, getSlots);

// Create booking — optionalAuth allows guest bookings; userId stored if logged in
router.post('/', optionalAuth, createRules, createBooking);

// Reserve slots for 30 mins without payment
router.post('/reserve', optionalAuth, createRules, reserveBooking);

// User's own bookings — requires auth
router.get('/my', authenticate, getMyBookings);

// Single booking by ID — optionalAuth (owner or admin check inside controller)
router.get('/:id', optionalAuth, getBookingById);

// Cancel — requires auth (owner or admin check inside controller)
router.patch('/:id/cancel', authenticate, cancelBooking);

// Manual payment update (admin use) — requires auth
router.patch('/:id/payment', authenticate, paymentRules, updatePayment);

export default router;