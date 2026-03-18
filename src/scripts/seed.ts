/**
 * Seed script – creates demo admin + user + sample bookings
 * Run:  npx ts-node src/scripts/seed.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User    from '../models/User';
import Booking from '../models/Booking';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/hypergreen360';

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // ── Admin user
  const adminEmail = 'admin@hypergreen360.com';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Admin', email: adminEmail,
      password: 'admin123', role: 'admin', isVerified: true,
    });
    console.log('✅ Admin created:', adminEmail, '/ password: admin123');
  } else {
    console.log('ℹ️  Admin already exists');
  }

  // ── Demo user
  const demoEmail = 'demo@hypergreen360.com';
  let demo = await User.findOne({ email: demoEmail });
  if (!demo) {
    demo = await User.create({
      name: 'Demo User', email: demoEmail,
      phone: '9876543210', password: 'demo123', isVerified: true,
    });
    console.log('✅ Demo user created:', demoEmail, '/ password: demo123');
  }

  // ── Sample bookings
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

  interface SampleBooking {
    userId:         mongoose.Types.ObjectId;
    userName:       string;
    userEmail:      string;
    userPhone:      string;
    sport:          'football' | 'cricket' | 'both';
    date:           string;
    timeSlots:      string[];
    duration:       number;
    isNightSlot:    boolean;
    baseAmount:     number;
    discountAmount: number;
    totalAmount:    number;
    status:         'confirmed';
    paymentStatus:  'paid' | 'pending';
  }

  const samples: SampleBooking[] = [
    {
      userId: demo!._id as mongoose.Types.ObjectId,
      userName: 'Demo User', userEmail: demoEmail, userPhone: '9876543210',
      sport: 'football', date: today,
      timeSlots: ['6:00 AM - 7:00 AM'], duration: 1,
      isNightSlot: false, baseAmount: 600, discountAmount: 0, totalAmount: 600,
      status: 'confirmed', paymentStatus: 'paid',
    },
    {
      userId: demo!._id as mongoose.Types.ObjectId,
      userName: 'Demo User', userEmail: demoEmail, userPhone: '9876543210',
      sport: 'cricket', date: tomorrow,
      timeSlots: ['7:00 PM - 8:00 PM', '8:00 PM - 9:00 PM'], duration: 2,
      isNightSlot: true, baseAmount: 2000, discountAmount: 200, totalAmount: 1800,
      status: 'confirmed', paymentStatus: 'pending',
    },
  ];

  for (const s of samples) {
    const exists = await Booking.findOne({ userId: s.userId, date: s.date });
    if (!exists) {
      await Booking.create(s);
      console.log(`✅ Booking created: ${s.date} → ${s.timeSlots[0]}`);
    }
  }

  console.log('\n🎉 Seed complete!');
  console.log('   Admin →  admin@hypergreen360.com  /  admin123');
  console.log('   Demo  →  demo@hypergreen360.com   /  demo123\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err: Error) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
