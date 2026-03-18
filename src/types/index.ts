import { Request } from 'express';
import { Document, Types } from 'mongoose';

export interface JwtPayload {
  id:    string;
  name:  string;
  email: string;
  role:  'user' | 'admin';
  iat?:  number;
  exp?:  number;
}

export interface AuthRequest extends Request {
  user?: IUserDocument;
}

export interface IUser {
  name:          string;
  email:         string;
  phone?:        string;
  password?:     string;
  googleId?:     string;
  avatar?:       string;
  provider:      'local' | 'google';
  role:          'user' | 'admin';
  isVerified:    boolean;
  isActive:      boolean;
  totalBookings: number;
  totalSpent:    number;
  lastLogin?:    Date;
}

export interface IUserDocument extends IUser, Document {
  _id:             Types.ObjectId;
  createdAt:       Date;
  updatedAt:       Date;
  comparePassword: (candidate: string) => Promise<boolean>;
  toPublic:        () => PublicUser;
}

export interface PublicUser {
  id:            Types.ObjectId;
  name:          string;
  email:         string;
  phone?:        string;
  avatar?:       string;
  role:          string;
  totalBookings: number;
  totalSpent:    number;
  createdAt:     Date;
}

export type SportType     = 'football' | 'cricket' | 'both';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'cash' | 'razorpay' | 'demo';
export type RefundStatus  = 'none' | 'pending' | 'processed';

export interface IBooking {
  userId?:            Types.ObjectId;
  userName:           string;
  userEmail:          string;
  userPhone:          string;
  teamSize?:          number;
  sport:              SportType;
  date:               string;
  timeSlots:          string[];
  duration:           number;
  isNightSlot:        boolean;
  baseAmount:         number;
  discountAmount:     number;
  totalAmount:        number;
  status:             BookingStatus;
  paymentStatus:      PaymentStatus;
  paymentMethod:      PaymentMethod;
  razorpayOrderId?:   string;
  razorpayPaymentId?: string;
  cancelledAt?:       Date;
  cancelReason?:      string;
  refundAmount:       number;
  refundStatus:       RefundStatus;
  adminNotes?:        string;
}

export interface IBookingDocument extends IBooking, Document {
  _id:        Types.ObjectId;
  bookingRef: string;
  createdAt:  Date;
  updatedAt:  Date;
}

export type ContactStatus = 'new' | 'read' | 'replied' | 'closed';

export interface IContact {
  name:        string;
  email:       string;
  phone?:      string;
  subject:     string;
  message:     string;
  status:      ContactStatus;
  adminReply?: string;
  repliedAt?:  Date;
  ipAddress?:  string;
}

export interface IContactDocument extends IContact, Document {
  _id:       Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlotInfo {
  slot:      string;
  from:      string;
  to:        string;
  isNight:   boolean;
  price:     number;
  available: boolean;
  isYours:   boolean;
}
