import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Booking from '../models/Booking';
import Turf from '../models/Turf';
import { AuthRequest, SlotInfo } from '../types';
import { getSlotPrice, calcPricing, buildSlotLabel } from '../utils/pricing';
import { sendBookingConfirmation } from '../utils/sendEmail';

// ── GET /api/bookings/slots?date=YYYY-MM-DD&turfId=thunder-arena
// Slots are scoped per turfId: each turf has independent availability.
// Prices in the response reflect this turf's own day/night rates.
export const getSlots = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return; }
  try {
    const { date, turfId } = req.query as { date: string; turfId?: string };

    // Look up turf from DB for dynamic pricing (falls back to static map if not found)
    let pricingOverride: { day: number; night: number } | undefined;
    if (turfId) {
      const turfDoc = await Turf.findOne({ turfId }).select('priceDay priceNight');
      if (turfDoc) pricingOverride = { day: turfDoc.priceDay, night: turfDoc.priceNight };
    }

    // Filter existing bookings by date + turfId so each turf has its own grid.
    // If no turfId is supplied (e.g. legacy call) we return global availability.
    const bookingFilter: Record<string, unknown> = {
      date,
      status: { $in: ['pending', 'confirmed'] },
    };
    if (turfId) bookingFilter.turfId = turfId;

    const existing = await Booking.find(bookingFilter).select('timeSlots userId');

    const bookedSet = new Set<string>();
    const yourSet   = new Set<string>();
    existing.forEach((b) => {
      b.timeSlots.forEach((s) => bookedSet.add(s));
      if (req.user && b.userId?.toString() === req.user._id.toString()) {
        b.timeSlots.forEach((s) => yourSet.add(s));
      }
    });

    // Build 24-slot grid: 6 AM → midnight, then midnight → 6 AM
    const hours = [
      ...Array.from({ length: 18 }, (_, i) => i + 6),
      ...Array.from({ length: 6 },  (_, i) => i),
    ];

    const slots: SlotInfo[] = hours.map((h) => {
      const label      = buildSlotLabel(h);
      const [from, to] = label.split(' - ');
      return {
        slot:      label,
        from,
        to,
        isNight:   h >= 18 || h < 6,
        price:     getSlotPrice(label, turfId, pricingOverride),
        available: !bookedSet.has(label),
        isYours:   yourSet.has(label),
      };
    });

    res.json({ success: true, date, turfId: turfId ?? null, slots });
  } catch (err) {
    console.error('Slots error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/bookings
export const createBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return; }
  try {
    const {
      userName, userEmail, userPhone, sport,
      turfId, turfName,
      date, timeSlots, teamSize,
    } = req.body as {
      userName: string; userEmail: string; userPhone: string;
      sport?: string; turfId?: string; turfName?: string;
      date: string; timeSlots: string[]; teamSize?: number;
    };

    // Block past dates
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      res.status(400).json({ success: false, message: 'Cannot book for past dates' });
      return;
    }

    // Conflict check — scoped to the same turfId.
    // Two different turfs CAN have the same time slot booked simultaneously.
    const conflictFilter: Record<string, unknown> = {
      date,
      timeSlots: { $in: timeSlots },
      status:    { $in: ['pending', 'confirmed'] },
    };
    if (turfId) conflictFilter.turfId = turfId;

    const conflicts = await Booking.find(conflictFilter);
    if (conflicts.length > 0) {
      const taken = [...new Set(conflicts.flatMap((b) => b.timeSlots))];
      res.status(409).json({
        success: false,
        message: `Slots already booked: ${taken.join(', ')}`,
        takenSlots: taken,
      });
      return;
    }

    // Pricing — look up turf from DB for dynamic rates; fall back to static map.
    let bookingPricingOverride: { day: number; night: number } | undefined;
    if (turfId) {
      const turfDoc = await Turf.findOne({ turfId }).select('priceDay priceNight');
      if (turfDoc) bookingPricingOverride = { day: turfDoc.priceDay, night: turfDoc.priceNight };
    }
    const { baseAmount, discountAmount, totalAmount } = calcPricing(timeSlots, turfId, bookingPricingOverride);

    const isNightSlot = timeSlots.some((s) => {
      const m = s.match(/^(\d+):00\s(AM|PM)/);
      if (!m) return false;
      let h = parseInt(m[1]);
      if (m[2] === 'PM' && h !== 12) h += 12;
      if (m[2] === 'AM' && h === 12) h = 0;
      return h >= 18 || h < 6;
    });

    const booking = await Booking.create({
      userId:         req.user?._id ?? null,
      userName,
      userEmail,
      userPhone,
      sport:          sport ?? 'football',
      turfId:         turfId  ?? null,
      turfName:       turfName ?? null,
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

    // NOTE: We do NOT increment User.totalBookings here.
    // The admin panel reads live counts via aggregation (adminController.getAllUsers)
    // so the stored counter is irrelevant. Incrementing it here caused double-counting
    // when payments were retried.

    // Non-blocking confirmation email
    // sendBookingConfirmation({
    //   to: userEmail, name: userName,
    //   bookingRef: booking.bookingRef,
    //   date, slots: timeSlots, total: totalAmount,
    // }).catch((e: Error) => console.error('Email failed:', e.message));

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
    if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
    if (!req.user) { res.status(401).json({ success: false, message: 'Authentication required' }); return; }
    const isOwner = booking.userId?.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Access denied' }); return;
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
    if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
    const isOwner = booking.userId?.toString() === req.user!._id.toString();
    if (!isOwner && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Access denied' }); return;
    }
    if (booking.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Already cancelled' }); return;
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

    // NOTE: We do NOT decrement User.totalBookings here.
    // Admin panel reads live counts via aggregation so the stored counter is unused.

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
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return; }
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
    const { razorpayPaymentId, razorpayOrderId } = req.body as {
      razorpayPaymentId: string; razorpayOrderId: string;
    };
    booking.paymentStatus     = 'paid';
    booking.paymentMethod     = 'razorpay';
    booking.razorpayPaymentId = razorpayPaymentId;
    booking.razorpayOrderId   = razorpayOrderId;
    await booking.save();
    res.json({ success: true, message: 'Payment recorded', booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};