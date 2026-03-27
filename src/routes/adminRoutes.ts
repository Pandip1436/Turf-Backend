import { Router } from 'express';
import {
  getDashboard,
  getAllBookings,
  getTurfBookingStats,
  updateBookingStatus,
  getAllUsers,
  getAllContacts,
  updateContact,
  getRevenue,
  getStaffUsers,
  createStaffUser,
  updateStaffUser,
  deleteStaffUser,
} from '../controllers/adminController';
import { authenticate, requireAdmin, requireAdminOrManager } from '../middleware/auth';

const router = Router();

// Routes accessible by admin or turf_manager
router.get   ('/dashboard',           authenticate, requireAdminOrManager, getDashboard);
router.get   ('/bookings/turf-stats', authenticate, requireAdminOrManager, getTurfBookingStats);
router.get   ('/bookings',            authenticate, requireAdminOrManager, getAllBookings);
router.patch ('/bookings/:id/status', authenticate, requireAdminOrManager, updateBookingStatus);

// Admin-only routes
router.get   ('/users',               authenticate, requireAdmin, getAllUsers);
router.get   ('/contacts',            authenticate, requireAdmin, getAllContacts);
router.patch ('/contacts/:id',        authenticate, requireAdmin, updateContact);
router.get   ('/revenue',             authenticate, requireAdminOrManager, getRevenue);

// Staff management (admin only)
router.get   ('/staff',               authenticate, requireAdmin, getStaffUsers);
router.post  ('/staff',               authenticate, requireAdmin, createStaffUser);
router.patch ('/staff/:id',           authenticate, requireAdmin, updateStaffUser);
router.delete('/staff/:id',           authenticate, requireAdmin, deleteStaffUser);

export default router;
