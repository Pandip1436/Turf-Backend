import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import https from 'https';
import User from '../models/User';
import { generateToken } from '../utils/generateToken';
import { AuthRequest } from '../types';

// ── Verify Google id_token by calling Google's tokeninfo endpoint
function verifyGoogleToken(idToken: string): Promise<{
  sub: string; email: string; name: string; picture?: string;
}> {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) { reject(new Error(payload.error_description || 'Invalid token')); return; }

          // Verify the token was issued for our app
          const clientId = process.env.GOOGLE_CLIENT_ID;
          if (clientId && payload.aud !== clientId) {
            reject(new Error('Token audience mismatch')); return;
          }
          resolve({
            sub:     payload.sub,
            email:   payload.email,
            name:    payload.name || `${payload.given_name} ${payload.family_name}`.trim(),
            picture: payload.picture,
          });
        } catch {
          reject(new Error('Failed to parse Google token response'));
        }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return; }

  try {
    const { name, email, phone, password } = req.body as {
      name: string; email: string; phone?: string; password: string;
    };

    const existing = await User.findOne({ email });
    if (existing) { res.status(409).json({ success: false, message: 'Email already registered' }); return; }

    const user  = await User.create({ name, email, phone, password, provider: 'local' });
    const token = generateToken(user);

    res.status(201).json({ success: true, message: 'Account created', token, user: user.toPublic() });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return; }

  try {
    const { email, password } = req.body as { email: string; password: string };

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' }); return;
    }
    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Account deactivated' }); return;
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user);
    res.json({ success: true, message: 'Signed in', token, user: user.toPublic() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────
//  POST /api/auth/google
//  Accepts:
//    { idToken }                 ← real Google GIS flow (verified server-side)
//    { name, email, googleId }   ← demo / fallback flow
// ─────────────────────────────────────────
export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken, name: bodyName, email: bodyEmail, googleId: bodyGoogleId, avatar: bodyAvatar } =
      req.body as {
        idToken?: string; name?: string; email?: string;
        googleId?: string; avatar?: string;
      };

    let name:     string;
    let email:    string;
    let googleId: string | undefined;
    let avatar:   string | undefined;

    if (idToken) {
      // ── Real GIS: verify token with Google
      try {
        const payload = await verifyGoogleToken(idToken);
        name     = payload.name;
        email    = payload.email;
        googleId = payload.sub;
        avatar   = payload.picture;
      } catch (verifyErr) {
        console.error('Google token verify failed:', verifyErr);
        res.status(401).json({ success: false, message: 'Google token verification failed' });
        return;
      }
    } else {
      // ── Demo / direct: trust name+email from frontend (dev only)
      if (!bodyEmail || !bodyName) {
        res.status(400).json({ success: false, message: 'name and email required' }); return;
      }
      name     = bodyName;
      email    = bodyEmail;
      googleId = bodyGoogleId;
      avatar   = bodyAvatar;

      // Warn in production
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  Google auth without idToken in production — set VITE_GOOGLE_CLIENT_ID');
      }
    }

    // ── Upsert user
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name, email, googleId, avatar,
        provider:   'google',
        isVerified: true,
      });
    } else {
      if (googleId) user.googleId = googleId;
      if (avatar)   user.avatar   = avatar;
      if (!user.name || user.provider !== 'google') user.name = name;
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Account deactivated' }); return;
    }

    const token = generateToken(user);
    res.json({ success: true, token, user: user.toPublic() });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────
//  GET /api/auth/me
// ─────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, user: req.user!.toPublic() });
};

// ─────────────────────────────────────────
//  PUT /api/auth/profile
// ─────────────────────────────────────────
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ success: false, errors: errors.array() }); return; }

  try {
    const { name, phone } = req.body as { name?: string; phone?: string };
    const user = await User.findById(req.user!._id);
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

    if (name)  user.name  = name;
    if (phone) user.phone = phone;
    await user.save();

    res.json({ success: true, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────
//  PUT /api/auth/change-password
// ─────────────────────────────────────────
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string; newPassword: string;
    };
    const user = await User.findById(req.user!._id).select('+password');
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

    if (user.provider !== 'local') {
      res.status(400).json({ success: false, message: 'Google accounts cannot change password here' }); return;
    }
    if (!(await user.comparePassword(currentPassword))) {
      res.status(401).json({ success: false, message: 'Current password incorrect' }); return;
    }

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};