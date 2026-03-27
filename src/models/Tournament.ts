import mongoose, { Schema } from 'mongoose';

// ── Player (participant within a team) ───────────────────────────────────────
export interface IPlayer {
  name:     string;
  age?:     number;
  position?: string; // e.g. "Goalkeeper", "Striker", "Batsman"
}

// ── Team registration ────────────────────────────────────────────────────────
export interface ITeamRegistration {
  _id: any;
  teamName:    string;
  captainName: string;
  captainEmail:string;
  captainPhone:string;
  players:     IPlayer[];
  paymentStatus: 'pending' | 'paid' | 'waived';
  registeredAt:  Date;
  userId?:       mongoose.Types.ObjectId;
}

// ── Tournament document ───────────────────────────────────────────────────────
export interface ITournamentDocument extends mongoose.Document {
  _id:           mongoose.Types.ObjectId;
  title:         string;
  sport:         'football' | 'cricket' | 'badminton';
  turfId:        string;
  turfName:      string;
  description:   string;
  format:        string; // e.g. "5-a-side knockout", "Box cricket league"
  banner:        string; // image path
  date:          string; // YYYY-MM-DD (start date)
  endDate?:      string;
  time:          string; // e.g. "6:00 PM"
  prize:         string; // e.g. "₹10,000 + Trophy"
  entryFee:      number; // per team in ₹ (0 = free)
  maxTeams:      number;
  minPlayers:    number; // per team
  maxPlayers:    number; // per team
  status:        'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  registrations: ITeamRegistration[];
  rules:         string[];
  createdAt:     Date;
  updatedAt:     Date;
}

const PlayerSchema = new Schema<IPlayer>({
  name:     { type: String, required: true, trim: true },
  age:      { type: Number, min: 5, max: 80 },
  position: { type: String, trim: true },
}, { _id: false });

const TeamRegistrationSchema = new Schema<ITeamRegistration>({
  teamName:     { type: String, required: true, trim: true },
  captainName:  { type: String, required: true, trim: true },
  captainEmail: { type: String, required: true, lowercase: true, trim: true },
  captainPhone: { type: String, required: true, match: [/^[0-9]{10}$/, '10 digits required'] },
  players:      { type: [PlayerSchema], default: [] },
  paymentStatus:{ type: String, enum: ['pending', 'paid', 'waived'], default: 'pending' },
  registeredAt: { type: Date, default: Date.now },
  userId:       { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

const TournamentSchema = new Schema<ITournamentDocument>(
  {
    title:       { type: String, required: true, trim: true },
    sport:       { type: String, enum: ['football', 'cricket', 'badminton'], required: true },
    turfId:      { type: String, required: true },
    turfName:    { type: String, required: true },
    description: { type: String, default: '' },
    format:      { type: String, default: '' },
    banner:      { type: String, default: '/images/Turf.jpg' },
    date:        { type: String, required: true },
    endDate:     { type: String },
    time:        { type: String, default: '6:00 PM' },
    prize:       { type: String, default: 'Trophy' },
    entryFee:    { type: Number, default: 0, min: 0 },
    maxTeams:    { type: Number, required: true, min: 2 },
    minPlayers:  { type: Number, default: 5 },
    maxPlayers:  { type: Number, default: 11 },
    status:      { type: String, enum: ['upcoming', 'ongoing', 'completed', 'cancelled'], default: 'upcoming' },
    registrations:{ type: [TeamRegistrationSchema], default: [] },
    rules:       { type: [String], default: [] },
  },
  { timestamps: true }
);

TournamentSchema.index({ date: 1, status: 1 });
TournamentSchema.index({ sport: 1 });

export default mongoose.model<ITournamentDocument>('Tournament', TournamentSchema);