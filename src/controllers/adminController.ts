import { Response } from 'express';
import Booking from '../models/Booking';
import User    from '../models/User';
import Contact from '../models/Contact';
import { AuthRequest, BookingStatus, ContactStatus } from '../types';

// ── GET /api/admin/dashboard
export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const isTurfManager = req.user?.role === 'turf_manager';
    const turfScope = isTurfManager ? { turfId: req.user?.assignedTurfId } : {};

    const [
      totalBookings,
      todayBookings,
      revenueAgg,
      recentBookings,
    ] = await Promise.all([
      Booking.countDocuments({ ...turfScope, status: { $ne: 'cancelled' } }),
      Booking.countDocuments({ ...turfScope, date: today, status: { $ne: 'cancelled' } }),
      Booking.aggregate([
        { $match: { ...turfScope, status: { $ne: 'cancelled' }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Booking.find({ ...turfScope, status: { $ne: 'cancelled' } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('userName userEmail date timeSlots totalAmount status createdAt'),
    ]);

    const totalUsers      = isTurfManager ? 0 : await User.countDocuments({ role: 'user' });
    const pendingContacts = isTurfManager ? 0 : await Contact.countDocuments({ status: 'new' });

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

// ── GET /api/admin/bookings/turf-stats
export const getTurfBookingStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isTurfManager = req.user?.role === 'turf_manager';
    const turfScope = isTurfManager ? { turfId: req.user?.assignedTurfId } : {};

    const stats = await Booking.aggregate([
      { $match: { ...turfScope, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$turfId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, stats });
  } catch (err) {
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
    const turfId = req.query.turfId as string | undefined;

    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo   = req.query.dateTo   as string | undefined;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (date) {
      filter.date = date;
    } else if (dateFrom || dateTo) {
      const range: Record<string, string> = {};
      if (dateFrom) range.$gte = dateFrom;
      if (dateTo)   range.$lte = dateTo;
      filter.date = range;
    }
    if (turfId) filter.turfId = turfId;
    if (req.user?.role === 'turf_manager') { filter.turfId = req.user.assignedTurfId; }
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

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }
    if (req.user?.role === 'turf_manager' && booking.turfId !== req.user.assignedTurfId) {
      res.status(403).json({ success: false, message: 'Access denied: not your branch booking' });
      return;
    }
    booking.status = status;
    if (adminNotes) booking.adminNotes = adminNotes;
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/admin/users
// ✅ Aggregates live booking counts from the Booking collection
//    instead of trusting the stored counter on the User document
//    (which could drift if payments were retried or refunded).
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

    if (users.length === 0) {
      res.json({
        success: true,
        users: [],
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
      return;
    }

    // ── Aggregate REAL booking stats per user from the Booking collection
    //    Only count confirmed/completed bookings with paid status
    const userIds = users.map(u => u._id);

    const bookingStats = await Booking.aggregate([
      {
        $match: {
          userId:        { $in: userIds },
          status:        { $in: ['confirmed', 'completed'] },
          paymentStatus: 'paid',
        },
      },
      {
        $group: {
          _id:          '$userId',
          totalBookings: { $sum: 1 },
          totalSpent:    { $sum: '$totalAmount' },
        },
      },
    ]);

    // Build a lookup map: userId string → { totalBookings, totalSpent }
    const statsMap = new Map<string, { totalBookings: number; totalSpent: number }>();
    for (const stat of bookingStats) {
      statsMap.set(String(stat._id), {
        totalBookings: stat.totalBookings,
        totalSpent:    stat.totalSpent,
      });
    }

    const usersWithStats = users.map(u => {
      const pub   = u.toPublic();
      const stats = statsMap.get(String(u._id)) ?? { totalBookings: 0, totalSpent: 0 };
      return {
        ...pub,
        totalBookings: stats.totalBookings,
        totalSpent:    stats.totalSpent,
      };
    });

    res.json({
      success: true,
      users: usersWithStats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('getAllUsers error:', err);
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
    const isTurfManager = req.user?.role === 'turf_manager';
    const turfScope = isTurfManager ? { turfId: req.user?.assignedTurfId } : {};

    const revenue = await Booking.aggregate([
      {
        $match: {
          ...turfScope,
          date:          { $regex: `^${month}` },
          status:        { $ne: 'cancelled' },
          paymentStatus: 'paid',
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

    res.json({
      success: true, month, revenue, totalRevenue,
      ...(isTurfManager && { turfId: req.user?.assignedTurfId }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/admin/staff
export const getStaffUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staff = await User.find({ role: { $in: ['admin', 'turf_manager'] } })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/admin/staff
export const createStaffUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, assignedTurfId } = req.body as {
      name: string; email: string; password: string;
      role: 'admin' | 'turf_manager'; assignedTurfId?: string;
    };

    if (!name || !email || !password || !role) {
      res.status(400).json({ success: false, message: 'name, email, password, and role are required' });
      return;
    }
    if (!['admin', 'turf_manager'].includes(role)) {
      res.status(400).json({ success: false, message: 'role must be admin or turf_manager' });
      return;
    }
    if (role === 'turf_manager' && !assignedTurfId) {
      res.status(400).json({ success: false, message: 'assignedTurfId is required for turf_manager' });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    const user = await User.create({
      name, email, password, role,
      assignedTurfId: role === 'turf_manager' ? assignedTurfId : undefined,
      provider: 'local', isActive: true, isVerified: true,
    });

    res.status(201).json({ success: true, message: 'Staff user created', user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PATCH /api/admin/staff/:id
export const updateStaffUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !['admin', 'turf_manager'].includes(user.role)) {
      res.status(404).json({ success: false, message: 'Staff user not found' });
      return;
    }
    // Prevent self-demotion
    if (String(user._id) === String(req.user?._id) && req.body.role && req.body.role !== 'admin') {
      res.status(400).json({ success: false, message: 'Cannot change your own role' });
      return;
    }

    const { name, role, assignedTurfId, isActive } = req.body as {
      name?: string; role?: string; assignedTurfId?: string; isActive?: boolean;
    };

    if (name !== undefined)           user.name           = name;
    if (isActive !== undefined)       user.isActive        = isActive;
    if (role !== undefined && ['admin', 'turf_manager'].includes(role)) {
      user.role = role as 'admin' | 'turf_manager';
    }
    if (assignedTurfId !== undefined) user.assignedTurfId = assignedTurfId || undefined;

    await user.save();
    res.json({ success: true, message: 'Staff user updated', user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── DELETE /api/admin/staff/:id
export const deleteStaffUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (String(req.params.id) === String(req.user?._id)) {
      res.status(400).json({ success: false, message: 'Cannot delete your own account' });
      return;
    }
    const user = await User.findById(req.params.id);
    if (!user || !['admin', 'turf_manager'].includes(user.role)) {
      res.status(404).json({ success: false, message: 'Staff user not found' });
      return;
    }
    await user.deleteOne();
    res.json({ success: true, message: 'Staff user deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};