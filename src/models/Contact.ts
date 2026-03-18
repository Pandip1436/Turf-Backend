import mongoose, { Schema } from 'mongoose';
import { IContactDocument } from '../types';

const ContactSchema = new Schema<IContactDocument>(
  {
    name:       { type: String, required: true, trim: true },
    email:      { type: String, required: true, lowercase: true, trim: true },
    phone:      { type: String, trim: true },
    subject:    { type: String, trim: true, default: 'General Enquiry' },
    message:    { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed'],
      default: 'new',
    },
    adminReply: { type: String },
    repliedAt:  { type: Date },
    ipAddress:  { type: String },
  },
  { timestamps: true }
);

ContactSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IContactDocument>('Contact', ContactSchema);
