import { Response } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import Booking from '../models/Booking';
import User    from '../models/User';
import { AuthRequest } from '../types';
import { sendBookingConfirmation } from '../utils/sendEmail';

function getRazorpay() {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay keys not configured in .env');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ─────────────────────────────────────────
//  POST /api/payments/create-order
//  Receives amount in RUPEES, returns order with paise
// ─────────────────────────────────────────
export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookingId, amount } = req.body as { bookingId: string; amount: number };

    if (!bookingId || !amount || amount <= 0) {
      res.status(400).json({ success: false, message: 'bookingId and valid amount (₹) required' });
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }
    if (booking.paymentStatus === 'paid') {
      res.status(400).json({ success: false, message: 'Booking already paid' });
      return;
    }

    const razorpay = getRazorpay();

    // ✅ Convert ₹ → paise ONCE, here in backend
    const amountPaise = Math.round(amount * 100);

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `hg360_${bookingId.slice(-8)}`,
      notes: {
        bookingId,
        date:  booking.date,
        slots: booking.timeSlots.join(', '),
        name:  booking.userName,
      },
    });

    booking.razorpayOrderId = order.id;
    await booking.save({ validateBeforeSave: false });

    res.json({
      success:  true,
      orderId:  order.id,
      keyId:    process.env.RAZORPAY_KEY_ID,
      amount:   amountPaise,   // ← paise, ready for Razorpay SDK
      currency: 'INR',
    });
  } catch (err) {
    const e = err as Error;
    console.error('Create order error:', e.message);
    res.status(500).json({ success: false, message: e.message || 'Failed to create order' });
  }
};

// ─────────────────────────────────────────
//  POST /api/payments/verify
// ─────────────────────────────────────────
export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature,
    } = req.body as {
      bookingId: string; razorpayOrderId: string;
      razorpayPaymentId: string; razorpaySignature: string;
    };

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ success: false, message: 'All payment verification fields required' });
      return;
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      res.status(500).json({ success: false, message: 'Payment configuration error' });
      return;
    }

    // ── HMAC-SHA256 signature verification
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expected !== razorpaySignature) {
      console.warn('⚠️  Signature mismatch', { expected, received: razorpaySignature });
      res.status(400).json({ success: false, message: 'Payment signature verification failed' });
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    if (booking.paymentStatus === 'paid') {
      // Idempotent — already processed
      res.json({ success: true, message: 'Already confirmed', bookingRef: booking.bookingRef });
      return;
    }

    // ── Mark paid
    booking.paymentStatus     = 'paid';
    booking.paymentMethod     = 'razorpay';
    booking.status            = 'confirmed';
    booking.razorpayOrderId   = razorpayOrderId;
    booking.razorpayPaymentId = razorpayPaymentId;
    await booking.save();

    // ── Update user stats (non-blocking)
    if (booking.userId) {
      User.findByIdAndUpdate(booking.userId, {
        $inc: { totalBookings: 1, totalSpent: booking.totalAmount },
      }).catch(console.error);
    }

    // ── Confirmation email (non-blocking)
    sendBookingConfirmation({
      to: booking.userEmail, name: booking.userName,
      bookingRef: booking.bookingRef,
      date: booking.date, slots: booking.timeSlots,
      total: booking.totalAmount,
    }).catch((e: Error) => console.error('Email failed:', e.message));

    res.json({
      success:    true,
      message:    'Payment verified. Booking confirmed! 🎉',
      bookingRef: booking.bookingRef,
      booking,
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ success: false, message: 'Verification error' });
  }
};

// ─────────────────────────────────────────
//  POST /api/payments/refund  (admin only)
// ─────────────────────────────────────────
export const initiateRefund = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookingId, amount, reason } = req.body as {
      bookingId: string; amount?: number; reason?: string;
    };

    const booking = await Booking.findById(bookingId);
    if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
    if (!booking.razorpayPaymentId) {
      res.status(400).json({ success: false, message: 'No Razorpay payment on this booking' }); return;
    }
    if (booking.paymentStatus !== 'paid') {
      res.status(400).json({ success: false, message: 'Booking not paid, cannot refund' }); return;
    }

    const razorpay = getRazorpay();
    const refundAmt = amount ?? booking.totalAmount;

    const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
      amount: Math.round(refundAmt * 100),
      notes:  { reason: reason || 'Customer cancellation', bookingId },
    });

    booking.paymentStatus = 'refunded';
    booking.refundAmount  = refundAmt;
    booking.refundStatus  = 'processed';
    booking.status        = 'cancelled';
    booking.adminNotes    = `Refund ID: ${refund.id}`;
    await booking.save();

    res.json({ success: true, message: `Refund of ₹${refundAmt} initiated`, refundId: refund.id });
  } catch (err) {
    const e = err as Error;
    console.error('Refund error:', e.message);
    res.status(500).json({ success: false, message: e.message || 'Refund failed' });
  }
};

// ─────────────────────────────────────────
//  POST /api/payments/webhook
//  express.raw() middleware applied in server.ts for this route
// ─────────────────────────────────────────
export const handleWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).json({ success: false, message: 'Webhook secret not configured' });
      return;
    }

    const sig  = req.headers['x-razorpay-signature'] as string;
    // req.body is a Buffer when using express.raw()
    const body = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);

    const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

    if (sig !== expected) {
      console.warn('⚠️  Webhook signature mismatch');
      res.status(400).json({ success: false, message: 'Invalid signature' });
      return;
    }

    const payload = Buffer.isBuffer(req.body) ? JSON.parse(body) : req.body;
    const event   = payload.event as string;
    console.log(`🔔 Razorpay webhook: ${event}`);

    if (event === 'payment.captured') {
      const payId   = payload.payload?.payment?.entity?.id as string;
      const orderId = payload.payload?.payment?.entity?.order_id as string;
      if (payId && orderId) {
        const b = await Booking.findOne({ razorpayOrderId: orderId });
        if (b && b.paymentStatus !== 'paid') {
          b.paymentStatus = 'paid'; b.razorpayPaymentId = payId; b.status = 'confirmed';
          await b.save();
          console.log(`✅ Webhook confirmed booking: ${b._id}`);
        }
      }
    }

    if (event === 'payment.failed') {
      const orderId = payload.payload?.payment?.entity?.order_id as string;
      if (orderId) {
        const b = await Booking.findOne({ razorpayOrderId: orderId });
        if (b) { b.paymentStatus = 'failed'; await b.save(); }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ success: false });
  }
};