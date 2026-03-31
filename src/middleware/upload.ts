import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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

const upload = multer({ storage: makeCloudinaryStorage('hypergreen360/turfs') });

export const uploadTournament = multer({ storage: makeCloudinaryStorage('hypergreen360/tournaments') });
export const uploadGallery = multer({ storage: makeCloudinaryStorage('hypergreen360/gallery') });

export { cloudinary };
export default upload;
