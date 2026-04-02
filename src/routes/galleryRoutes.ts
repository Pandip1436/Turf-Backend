import { Router } from 'express';
import {
  getGalleryImages,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  uploadGalleryImage,
} from '../controllers/galleryController';
import { authenticate, requireAdminOrManager } from '../middleware/auth';
import { uploadGallerySingle } from '../middleware/upload';

const router = Router();

// Public
router.get('/', getGalleryImages);

// Admin + Branch Manager
router.post  ('/upload', authenticate, requireAdminOrManager, uploadGallerySingle, uploadGalleryImage);
router.post  ('/',       authenticate, requireAdminOrManager, createGalleryImage);
router.put   ('/:id',    authenticate, requireAdminOrManager, updateGalleryImage);
router.delete('/:id',    authenticate, requireAdminOrManager, deleteGalleryImage);

export default router;
