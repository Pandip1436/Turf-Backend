import { Router } from 'express';
import { getTurfs, getTurfById, createTurf, updateTurf, deleteTurf, uploadTurfImage } from '../controllers/turfController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';

const router = Router();

// ── Public routes
router.get('/',         getTurfs);
router.get('/:turfId',  getTurfById);

// ── Admin routes
router.post  ('/upload',   authenticate, requireAdmin, uploadSingle, uploadTurfImage);
router.post  ('/',         authenticate, requireAdmin, createTurf);
router.put   ('/:turfId',  authenticate, requireAdmin, updateTurf);
router.delete('/:turfId',  authenticate, requireAdmin, deleteTurf);

export default router;
