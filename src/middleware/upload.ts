import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { Request, Response, NextFunction } from 'express';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('⚠️  Missing Cloudinary env vars — uploads will fail.');
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key:    CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

function makeCloudinaryStorage(folder: string) {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    } as object,
  });
}

/** Wraps multer.single() to catch Cloudinary errors and return a proper JSON response */
function wrapSingle(uploader: multer.Multer, field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    uploader.single(field)(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        console.error('Cloudinary upload error:', err);
        return res.status(500).json({ success: false, message: `Image upload failed: ${msg}` });
      }
      next();
    });
  };
}

const _upload = multer({ storage: makeCloudinaryStorage('hypergreen360/turfs') });
const _uploadTournament = multer({ storage: makeCloudinaryStorage('hypergreen360/tournaments') });
const _uploadGallery = multer({ storage: makeCloudinaryStorage('hypergreen360/gallery') });

export const uploadSingle       = wrapSingle(_upload, 'image');
export const uploadTournamentSingle = wrapSingle(_uploadTournament, 'image');
export const uploadGallerySingle    = wrapSingle(_uploadGallery, 'image');

// Keep legacy exports for backward compat
const upload = _upload;
export const uploadTournament = _uploadTournament;
export const uploadGallery = _uploadGallery;

export { cloudinary };
export default upload;
