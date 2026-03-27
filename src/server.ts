import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors     from 'cors';
import helmet   from 'helmet';
import morgan   from 'morgan';
import path     from 'path';
import { rateLimit } from 'express-rate-limit';

import authRoutes       from './routes/authRoutes';
import bookingRoutes    from './routes/bookingRoutes';
import contactRoutes    from './routes/contactRoutes';
import adminRoutes      from './routes/adminRoutes';
import tournamentRoutes from './routes/tournamentroutes';
import paymentRoutes    from './routes/paymentRoutes';
import turfRoutes       from './routes/turfRoutes';


const app  = express();
app.set("trust proxy", 1);

const PORT = parseInt(process.env.PORT || '5000', 10);

// ── Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://checkout.razorpay.com",
          "https://cdn.razorpay.com"
        ],

        frameSrc: [
          "'self'",
          "https://checkout.razorpay.com",
          "https://api.razorpay.com"
        ],

        connectSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com",
          "https://lumberjack.razorpay.com"
        ],

        imgSrc: [
          "'self'",
          "data:",
          "https:"
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'"
        ]
      }
    }
  })
);

// ── Suppress sensor permission warnings from Razorpay's fraud detection
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), gyroscope=(), magnetometer=(), payment=(self "https://checkout.razorpay.com")'
  );
  next();
});

// ── CORS
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://hypergreen360-turf360.pages.dev",
  "https://hypergreenturftown.pages.dev"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// ── Body parsers
// Raw body needed for Razorpay webhook signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
// JSON for everything else
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP logger (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ── Global rate limiter (100 req / 15 min per IP) — skipped for admin in dev
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Try again later.' },
  }));
} else {
  // In development: relaxed limit so Strict Mode double-invokes don't trigger 429
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Try again later.' },
  }));
}

// ── Static uploads (allow cross-origin so the frontend can load images)
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// ── Routes
app.use('/api/auth',       authRoutes);
app.use('/api/bookings',   bookingRoutes);
app.use('/api/contact',    contactRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/payments',   paymentRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/turfs',      turfRoutes);

// ── Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    success:   true,
    message:   'HyperGreen 360 API is running ⚡',
    env:       process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ── Connect MongoDB then start
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hypergreen360')
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server  →  http://localhost:${PORT}`);
      console.log(`🏥 Health  →  http://localhost:${PORT}/api/health`);
    });
  })
  .catch((err: Error) => {
    console.error('❌ MongoDB failed:', err.message);
    app.listen(PORT, () => console.log(`🚀 Server on port ${PORT} (DB offline)`));
  });

export default app;