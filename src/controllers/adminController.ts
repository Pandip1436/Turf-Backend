import { Response } from 'express';
import Booking from '../models/Booking';
import User    from '../models/User';
import Contact from '../models/Contact';
import { AuthRequest, BookingStatus, ContactStatus } from '../types';

// ── GET /api/admin/dashboard
export const getDashboard = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      totalBookings,
      todayBookings,
      revenueAgg,
      totalUsers,
      pendingContacts,
      recentBookings,
    ] = await Promise.all([
      Booking.countDocuments({ status: { $ne: 'cancelled' } }),
      Booking.countDocuments({ date: today, status: { $ne: 'cancelled' } }),
      Booking.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      User.countDocuments({ role: 'user' }),
      Contact.countDocuments({ status: 'new' }),
      Booking.find({ status: { $ne: 'cancelled' } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('userName userEmail date timeSlots totalAmount status createdAt'),
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings,
        todayBookings,
        totalRevenue: (revenueAgg[0] as { total?: number } | undefined)?.total ?? 0,
        totalUsers,
        pendingContacts,
      },
      recentBookings,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/admin/bookings
export const getAllBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page   = parseInt((req.query.page   as string) || '1');
    const limit  = parseInt((req.query.limit  as string) || '20');
    const skip   = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const date   = req.query.date   as string | undefined;
    const search = req.query.search as string | undefined;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (date)   filter.date   = date;
    if (search) {
      filter.$or = [
        { userName:  { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { userPhone: { $regex: search, $options: 'i' } },
      ];
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Booking.countDocuments(filter),
    ]);

    res.json({
      success: true,
      bookings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PATCH /api/admin/bookings/:id/status
export const updateBookingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, adminNotes } = req.body as {
      status: BookingStatus; adminNotes?: string;
    };
    const allowed: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];
    if (!allowed.includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status, ...(adminNotes && { adminNotes }) },
      { new: true }
    );
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/admin/users
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page   = parseInt((req.query.page  as string) || '1');
    const limit  = parseInt((req.query.limit as string) || '20');
    const skip   = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    const filter: Record<string, unknown> = { role: 'user' };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users: users.map((u) => u.toPublic()),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/admin/contacts
export const getAllContacts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;

    const contacts = await Contact.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PATCH /api/admin/contacts/:id
export const updateContact = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, adminReply } = req.body as {
      status?: ContactStatus; adminReply?: string;
    };
    const update: Record<string, unknown> = {};
    if (status)     update.status     = status;
    if (adminReply) { update.adminReply = adminReply; update.repliedAt = new Date(); }

    const contact = await Contact.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }
    res.json({ success: true, contact });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/admin/revenue?month=YYYY-MM
export const getRevenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

    const revenue = await Booking.aggregate([
      {
        $match: {
          date:   { $regex: `^${month}` },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id:          '$date',
          totalRevenue: { $sum: '$totalAmount' },
          bookingCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalRevenue = revenue.reduce(
      (s: number, r: { totalRevenue: number }) => s + r.totalRevenue,
      0
    );

    res.json({ success: true, month, revenue, totalRevenue });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
