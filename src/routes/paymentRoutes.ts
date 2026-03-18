import { Router } from 'express';
import { body } from 'express-validator';
import {
  createOrder,
  verifyPayment,
  initiateRefund,
  handleWebhook,
} from '../controllers/paymentController';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';


const router = Router();

// ── Create Razorpay order (guest or user)
router.post(
  '/create-order',
  optionalAuth,
  [
    body('bookingId').notEmpty().withMessage('bookingId required'),
    body('amount').isInt({ min: 1 }).withMessage('Valid amount required'),
  ],
  createOrder
);

// ── Verify payment signature after Razorpay callback
router.post(
  '/verify',
  optionalAuth,
  [
    body('bookingId').notEmpty(),
    body('razorpayOrderId').notEmpty(),
    body('razorpayPaymentId').notEmpty(),
    body('razorpaySignature').notEmpty(),
  ],
  verifyPayment
);

// ── Initiate refund (admin only)
router.post(
  '/refund',
  authenticate,
  requireAdmin,
  [
    body('bookingId').notEmpty().withMessage('bookingId required'),
    body('amount').optional().isInt({ min: 1 }),
  ],
  initiateRefund
);

// ── Razorpay webhook (no auth – signature verified inside controller)
// In production, ensure this route receives raw body (use express.raw middleware)
router.post('/webhook', handleWebhook);

export default router;