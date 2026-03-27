import { Request, Response } from 'express';
import Turf from '../models/Turf';

// ── POST /api/turfs/upload  (admin only)
export const uploadTurfImage = (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded' });
    return;
  }
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/uploads/turfs/${req.file.filename}`;
  res.json({ success: true, url });
};

/** Converts a name to a URL-safe slug. */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── GET /api/turfs
// Public. Optional query: ?sport=football|cricket|badminton&active=true
export const getTurfs = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.sport)  filter.sport    = req.query.sport;
    if (req.query.active !== undefined) filter.isActive = req.query.active !== 'false';

    const turfs = await Turf.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, turfs });
  } catch (err) {
    console.error('getTurfs error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/turfs/:turfId
// Public. turfId is the slug (e.g. 'thunder-arena').
export const getTurfById = async (req: Request, res: Response): Promise<void> => {
  try {
    const turf = await Turf.findOne({ turfId: req.params.turfId });
    if (!turf) { res.status(404).json({ success: false, message: 'Turf not found' }); return; }
    res.json({ success: true, turf });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/admin/turfs  (admin only)
export const createTurf = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name, sport, description, features,
      priceDay, priceNight, image, isActive, order, turfId: customId,
    } = req.body as {
      name: string; sport: string; description?: string; features?: string[];
      priceDay: number; priceNight: number; image?: string;
      isActive?: boolean; order?: number; turfId?: string;
    };

    if (!name || !sport || priceDay == null || priceNight == null) {
      res.status(400).json({ success: false, message: 'name, sport, priceDay, priceNight are required' });
      return;
    }

    const turfId = customId?.trim() || toSlug(name);

    const exists = await Turf.findOne({ turfId });
    if (exists) {
      res.status(409).json({ success: false, message: `Turf ID "${turfId}" already exists. Use a different name or custom ID.` });
      return;
    }

    const turf = await Turf.create({
      turfId, name, sport, description: description ?? '',
      features: features ?? [],
      priceDay, priceNight,
      image: image ?? '/images/Turf.jpg',
      isActive: isActive ?? true,
      order: order ?? 0,
    });

    res.status(201).json({ success: true, message: 'Turf created', turf });
  } catch (err) {
    console.error('createTurf error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PUT /api/admin/turfs/:turfId  (admin only)
export const updateTurf = async (req: Request, res: Response): Promise<void> => {
  try {
    const turf = await Turf.findOne({ turfId: req.params.turfId });
    if (!turf) { res.status(404).json({ success: false, message: 'Turf not found' }); return; }

    const allowed = ['name', 'sport', 'description', 'features', 'priceDay', 'priceNight', 'image', 'isActive', 'order'] as const;
    for (const key of allowed) {
      if (req.body[key] !== undefined) turf.set(key, req.body[key]);
    }

    await turf.save();
    res.json({ success: true, message: 'Turf updated', turf });
  } catch (err) {
    console.error('updateTurf error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── DELETE /api/admin/turfs/:turfId  (admin only)
export const deleteTurf = async (req: Request, res: Response): Promise<void> => {
  try {
    const turf = await Turf.findOneAndDelete({ turfId: req.params.turfId });
    if (!turf) { res.status(404).json({ success: false, message: 'Turf not found' }); return; }
    res.json({ success: true, message: 'Turf deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
