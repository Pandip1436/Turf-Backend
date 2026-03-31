import mongoose, { Schema, Document } from 'mongoose';

export interface IGallery extends Document {
  turfId:    string;   // references Turf.turfId
  turfName:  string;   // denormalized for display
  sport:     'football' | 'cricket' | 'badminton';
  image:     string;   // Cloudinary URL
  title:     string;
  desc:      string;
  category:  'field' | 'night' | 'facilities' | 'tournament';
  date:      string;   // YYYY-MM-DD
  createdAt: Date;
  updatedAt: Date;
}

const GallerySchema = new Schema<IGallery>(
  {
    turfId:   { type: String, required: true, index: true },
    turfName: { type: String, required: true },
    sport:    { type: String, enum: ['football', 'cricket', 'badminton'], required: true },
    image:    { type: String, required: true },
    title:    { type: String, required: true, trim: true },
    desc:     { type: String, default: '' },
    category: { type: String, enum: ['field', 'night', 'facilities', 'tournament'], default: 'field' },
    date:     { type: String, required: true },
  },
  { timestamps: true }
);

GallerySchema.index({ turfId: 1, category: 1 });

export default mongoose.model<IGallery>('Gallery', GallerySchema);
