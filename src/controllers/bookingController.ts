import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Booking from '../models/Booking';
import User    from '../models/User';
import { AuthRequest, SlotInfo } from '../types';
import { getSlotPrice, calcPricing, buildSlotLabel } from '../utils/pricing';
import { sendBookingConfirmation } from '../utils/sendEmail';

// ── GET /api/bookings/slots?date=YYYY-MM-DD
export const getSlots = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  try {
    const { date } = req.query as { date: string };

    const existing = await Booking.find({
      date,
      status: { $in: ['pending', 'confirmed'] },
    }).select('timeSlots userId');

    const bookedSet   = new Set<string>();
    const yourSet     = new Set<string>();

    existing.forEach((b) => {
      b.timeSlots.forEach((s) => bookedSet.add(s));
      if (req.user && b.userId?.toString() === req.user._id.toString()) {
        b.timeSlots.forEach((s) => yourSet.add(s));
      }
    });

    // 6 AM → midnight, then midnight → 6 AM
    const hours = [
      ...Array.from({ length: 18 }, (_, i) => i + 6),
      ...Array.from({ length: 6 },  (_, i) => i),
    ];

    const slots: SlotInfo[] = hours.map((h) => {
      const label = buildSlotLabel(h);
      const [from, to] = label.split(' - ');
      return {
        slot:      label,
        from,
        to,
        isNight:   h >= 18 || h < 6,
        price:     getSlotPrice(label),
        available: !bookedSet.has(label),
        isYours:   yourSet.has(label),
      };
    });

    res.json({ success: true, date, slots });
  } catch (err) {
    console.error('Slots error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/bookings
export const createBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  try {
    const {
      userName, userEmail, userPhone, sport,
      date, timeSlots, teamSize,
    } = req.body as {
      userName: string; userEmail: string; userPhone: string;
      sport?: string;  date: string; timeSlots: string[]; teamSize?: number;
    };

    // Block past dates
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      res.status(400).json({ success: false, message: 'Cannot book for past dates' });
      return;
    }

    // Conflict check
    const conflicts = await Booking.find({
      date,
      timeSlots: { $in: timeSlots },
      status:    { $in: ['pending', 'confirmed'] },
    });
    if (conflicts.length > 0) {
      const taken = [...new Set(conflicts.flatMap((b) => b.timeSlots))];
      res.status(409).json({
        success: false,
        message: `Slots already booked: ${taken.join(', ')}`,
        takenSlots: taken,
      });
      return;
    }

    const { baseAmount, discountAmount, totalAmount } = calcPricing(timeSlots);
    const isNightSlot = timeSlots.some((s) => getSlotPrice(s) === 1000);

    const booking = await Booking.create({
      userId:         req.user?._id ?? null,
      userName,
      userEmail,
      userPhone,
      sport:          sport ?? 'football',
      date,
      timeSlots,
      duration:       timeSlots.length,
      isNightSlot,
      teamSize:       teamSize ?? null,
      baseAmount,
      discountAmount,
      totalAmount,
      status:         'confirmed',
      paymentStatus:  'pending',
      paymentMethod:  'upi',
    });

    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { totalBookings: 1, totalSpent: totalAmount },
      });
    }

    // Non-blocking email
    sendBookingConfirmation({
      to: userEmail, name: userName,
      bookingRef: booking.bookingRef,
      date, slots: timeSlots, total: totalAmount,
    }).catch((e: Error) => console.error('Email failed:', e.message));

    res.status(201).json({ success: true, message: 'Booking confirmed!', booking });
  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/bookings/my
export const getMyBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page  = parseInt((req.query.page  as string) || '1');
    const limit = parseInt((req.query.limit as string) || '10');
    const skip  = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      Booking.find({ userId: req.user!._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Booking.countDocuments({ userId: req.user!._id }),
    ]);

    res.json({
      success: true, bookings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/bookings/:id
export const getBookingById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const isOwner = booking.userId?.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PATCH /api/bookings/:id/cancel
export const cancelBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }
    const isOwner = booking.userId?.toString() === req.user!._id.toString();
    if (!isOwner && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    if (booking.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Already cancelled' });
      return;
    }

    const bookingDate = new Date(`${booking.date}T00:00:00`);
    const hoursUntil  = (bookingDate.getTime() - Date.now()) / (1000 * 60 * 60);
    const refundPct   = hoursUntil >= 24 ? 100 : hoursUntil >= 4 ? 50 : 0;
    const refundAmt   = Math.round(booking.totalAmount * refundPct / 100);

    booking.status       = 'cancelled';
    booking.cancelledAt  = new Date();
    booking.cancelReason = (req.body as { reason?: string }).reason || 'User cancelled';
    booking.refundAmount = refundAmt;
    booking.refundStatus = refundAmt > 0 ? 'pending' : 'none';
    await booking.save();

    if (booking.userId) {
      await User.findByIdAndUpdate(booking.userId, {
        $inc: { totalBookings: -1, totalSpent: -booking.totalAmount },
      });
    }

    res.json({
      success: true,
      message: `Cancelled. Refund: ₹${refundAmt} (${refundPct}%)`,
      refundAmount: refundAmt, refundPct,
    });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PATCH /api/bookings/:id/payment
export const updatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }
    const { razorpayPaymentId, razorpayOrderId } = req.body as {
      razorpayPaymentId: string; razorpayOrderId: string;
    };
    booking.paymentStatus      = 'paid';
    booking.paymentMethod      = 'razorpay';
    booking.razorpayPaymentId  = razorpayPaymentId;
    booking.razorpayOrderId    = razorpayOrderId;
    await booking.save();

    res.json({ success: true, message: 'Payment recorded', booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
