import mongoose, { Schema, Document } from 'mongoose';

export interface ITurf extends Document {
  turfId:      string;   // slug used in bookings (e.g. 'thunder-arena')
  name:        string;
  sport:       'football' | 'cricket' | 'badminton';
  description: string;
  features:    string[];
  priceDay:    number;
  priceNight:  number;
  image:       string;
  isActive:    boolean;
  order:       number;
  createdAt:   Date;
  updatedAt:   Date;
}

const TurfSchema = new Schema<ITurf>(
  {
    turfId:      { type: String, required: true, unique: true, trim: true, lowercase: true },
    name:        { type: String, required: true, trim: true },
    sport:       { type: String, enum: ['football', 'cricket', 'badminton'], required: true },
    description: { type: String, default: '' },
    features:    { type: [String], default: [] },
    priceDay:    { type: Number, required: true, min: 0 },
    priceNight:  { type: Number, required: true, min: 0 },
    image:       { type: String, default: '/images/Turf.jpg' },
    isActive:    { type: Boolean, default: true },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

TurfSchema.index({ sport: 1, isActive: 1 });

export default mongoose.model<ITurf>('Turf', TurfSchema);
