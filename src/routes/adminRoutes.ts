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
} from '../controllers/adminController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// All admin routes: authenticate + admin role
router.use(authenticate, requireAdmin);

router.get   ('/dashboard',           getDashboard);
router.get   ('/bookings/turf-stats', getTurfBookingStats);
router.get   ('/bookings',            getAllBookings);
router.patch ('/bookings/:id/status', updateBookingStatus);
router.get   ('/users',               getAllUsers);
router.get   ('/contacts',            getAllContacts);
router.patch ('/contacts/:id',        updateContact);
router.get   ('/revenue',             getRevenue);

export default router;
