import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUserDocument, PublicUser } from '../types';

const UserSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String, required: [true, 'Name is required'],
      trim: true, minlength: 2, maxlength: 60,
    },
    email: {
      type: String, required: [true, 'Email is required'],
      unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    phone: {
      type: String, trim: true,
      match: [/^[0-9]{10}$/, 'Phone must be 10 digits'],
    },
    password: { type: String, minlength: 6, select: false },
    googleId:  { type: String, sparse: true },
    avatar:    { type: String },
    provider:  { type: String, enum: ['local', 'google'], default: 'local' },
    role:      { type: String, enum: ['user', 'admin', 'turf_manager'], default: 'user' },
    assignedTurfId: { type: String, trim: true, lowercase: true },
    isVerified:    { type: Boolean, default: false },
    isActive:      { type: Boolean, default: true  },
    totalBookings: { type: Number,  default: 0     },
    totalSpent:    { type: Number,  default: 0     },
    lastLogin:     { type: Date },
  },
  { timestamps: true }
);

// ── Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Compare password
UserSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

// ── Return safe public profile
UserSchema.methods.toPublic = function (): PublicUser {
  return {
    id:            this._id,
    name:          this.name,
    email:         this.email,
    phone:         this.phone,
    avatar:        this.avatar,
    role:           this.role,
    assignedTurfId: this.assignedTurfId,
    totalBookings:  this.totalBookings,
    totalSpent:     this.totalSpent,
    createdAt:      this.createdAt,
  };
};

export default mongoose.model<IUserDocument>('User', UserSchema);
