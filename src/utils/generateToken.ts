import jwt from 'jsonwebtoken';
import { IUserDocument } from '../types';

const JWT_SECRET  = process.env.JWT_SECRET  || 'hypergreen360_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

export const generateToken = (user: IUserDocument): string =>
  jwt.sign(
    { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES } as jwt.SignOptions
  );
