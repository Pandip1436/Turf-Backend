import mongoose, { Schema } from 'mongoose';
import { IBookingDocument } from '../types';

const BookingSchema = new Schema<IBookingDocument>(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userName:  { type: String, required: true, trim: true },
    userEmail: { type: String, required: true, lowercase: true, trim: true },
    userPhone: {
      type: String, required: true,
      match: [/^[0-9]{10}$/, 'Phone must be 10 digits'],
    },
    teamSize: { type: Number, min: 1, max: 30, default: null },

    sport: {
      type: String,
      enum: ['football', 'cricket', 'badminton', 'both'],
      default: 'football',
    },

    // ── Turf fields (added for multi-turf support) ────────────────────────
    // turfId  — matches the id in TURFS[] on the frontend (e.g. 'thunder-arena')
    // turfName — human-readable name stored for display in admin panel
    // Conflict checks and slot availability are scoped per turfId so two different
    // turfs can have the same time slot booked simultaneously.
    turfId:   { type: String, default: null },
    turfName: { type: String, default: null },

    date:      { type: String, required: true },
    timeSlots: {
      type: [String], required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one time slot required',
      },
    },
    duration:    { type: Number, default: 1 },
    isNightSlot: { type: Boolean, default: false },

    baseAmount:     { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    totalAmount:    { type: Number, required: true },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show', 'reserved'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded', 'failed'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['upi', 'card', 'netbanking', 'cash', 'razorpay', 'demo'],
      default: 'upi',
    },
    razorpayOrderId:   { type: String },
    razorpayPaymentId: { type: String },

    reservedUntil: { type: Date, default: null },

    cancelledAt:  { type: Date },
    cancelReason: { type: String },
    refundAmount: { type: Number, default: 0 },
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'processed'],
      default: 'none',
    },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

// ── Indexes
BookingSchema.index({ date: 1, turfId: 1, status: 1 }); // turf-scoped availability queries
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ userEmail: 1 });
BookingSchema.index({ turfId: 1 });

// ── Virtual: short booking reference e.g. HG3F2A1B
BookingSchema.virtual('bookingRef').get(function (this: IBookingDocument) {
  return `HG${this._id.toString().slice(-6).toUpperCase()}`;
});

BookingSchema.set('toJSON', { virtuals: true });

export default mongoose.model<IBookingDocument>('Booking', BookingSchema);