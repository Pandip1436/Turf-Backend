import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

function makeStorage(folder: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(__dirname, `../../uploads/${folder}`);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  });
}

const upload = multer({
  storage: makeStorage('turfs'),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadTournament = multer({
  storage: makeStorage('tournaments'),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export default upload;
