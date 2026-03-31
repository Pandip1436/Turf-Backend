import { Request, Response } from 'express';
import Gallery from '../models/Gallery';
import { AuthRequest } from '../types';

// ── Public: get all gallery images (with optional filters)
export const getGalleryImages = async (req: Request, res: Response) => {
  try {
    const { turfId, category, sport } = req.query;
    const filter: Record<string, unknown> = {};
    if (turfId)   filter.turfId   = turfId;
    if (category) filter.category = category;
    if (sport)    filter.sport    = sport;

    const images = await Gallery.find(filter).sort({ date: -1, createdAt: -1 });
    res.json({ success: true, images });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch gallery images' });
  }
};

// ── Admin / Manager: create gallery image
export const createGalleryImage = async (req: AuthRequest, res: Response) => {
  try {
    const { turfId, turfName, sport, image, title, desc, category, date } = req.body;
    if (!turfId || !turfName || !sport || !image || !title || !date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Turf managers can only add images for their assigned turf
    if (req.user?.role === 'turf_manager' && turfId !== req.user.assignedTurfId) {
      return res.status(403).json({ success: false, message: 'You can only add images for your assigned turf' });
    }

    const item = await Gallery.create({ turfId, turfName, sport, image, title, desc, category, date });
    res.status(201).json({ success: true, image: item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create gallery image' });
  }
};

// ── Admin / Manager: update gallery image
export const updateGalleryImage = async (req: AuthRequest, res: Response) => {
  try {
    const item = await Gallery.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Image not found' });

    // Turf managers can only edit images for their assigned turf
    if (req.user?.role === 'turf_manager' && item.turfId !== req.user.assignedTurfId) {
      return res.status(403).json({ success: false, message: 'You can only edit images for your assigned turf' });
    }

    // Prevent manager from changing turfId
    if (req.user?.role === 'turf_manager') delete req.body.turfId;

    const updated = await Gallery.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, image: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update gallery image' });
  }
};

// ── Admin / Manager: delete gallery image
export const deleteGalleryImage = async (req: AuthRequest, res: Response) => {
  try {
    const item = await Gallery.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Image not found' });

    // Turf managers can only delete images for their assigned turf
    if (req.user?.role === 'turf_manager' && item.turfId !== req.user.assignedTurfId) {
      return res.status(403).json({ success: false, message: 'You can only delete images for your assigned turf' });
    }

    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete gallery image' });
  }
};

// ── Upload gallery image to Cloudinary
export const uploadGalleryImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    res.json({ success: true, url: (req.file as Express.Multer.File & { path: string }).path });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
};
