import { Request, Response } from 'express';
import Tournament from '../models/Tournament';
import { AuthRequest } from '../types';

// ── POST /api/tournaments/upload  (admin / turf_manager)
export const uploadTournamentBanner = (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded' });
    return;
  }
  // Cloudinary returns the URL in req.file.path
  const url = (req.file as Express.Multer.File & { path: string }).path;
  res.json({ success: true, url });
};

// ── GET /api/tournaments — list all (with optional filters)
export const getTournaments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sport, status } = req.query as { sport?: string; status?: string };
    const filter: Record<string, unknown> = {};
    if (sport)  filter.sport  = sport;
    if (status) filter.status = status;

    const tournaments = await Tournament.find(filter)
      .sort({ date: 1 })
      .select('-registrations.captainEmail -registrations.captainPhone'); // hide PII in list

    // Attach registration count without exposing full details
    const result = tournaments.map(t => ({
      ...t.toObject(),
      registeredTeams: t.registrations.length,
      spotsLeft: t.maxTeams - t.registrations.length,
    }));

    res.json({ success: true, tournaments: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/tournaments/:id — single tournament with registration list
export const getTournamentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      res.status(404).json({ success: false, message: 'Tournament not found' });
      return;
    }
    res.json({
      success: true,
      tournament: {
        ...tournament.toObject(),
        registeredTeams: tournament.registrations.length,
        spotsLeft: tournament.maxTeams - tournament.registrations.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/tournaments/:id/register — register a team
export const registerTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      res.status(404).json({ success: false, message: 'Tournament not found' });
      return;
    }
    if (tournament.status !== 'upcoming') {
      res.status(400).json({ success: false, message: 'Registration is closed for this tournament' });
      return;
    }
    if (tournament.registrations.length >= tournament.maxTeams) {
      res.status(400).json({ success: false, message: 'Tournament is full' });
      return;
    }

    const { teamName, captainName, captainEmail, captainPhone, players } = req.body as {
      teamName: string; captainName: string; captainEmail: string;
      captainPhone: string; players: { name: string; age?: number; position?: string }[];
    };

    // Prevent duplicate team name in same tournament
    const duplicate = tournament.registrations.find(
      r => r.teamName.toLowerCase() === teamName.toLowerCase()
    );
    if (duplicate) {
      res.status(409).json({ success: false, message: 'A team with this name is already registered' });
      return;
    }

    // Player count validation
    if (players.length < tournament.minPlayers) {
      res.status(400).json({
        success: false,
        message: `Minimum ${tournament.minPlayers} players required`,
      });
      return;
    }
    if (players.length > tournament.maxPlayers) {
      res.status(400).json({
        success: false,
        message: `Maximum ${tournament.maxPlayers} players allowed`,
      });
      return;
    }

    tournament.registrations.push({
        teamName,
        captainName,
        captainEmail,
        captainPhone,
        players,
        paymentStatus: tournament.entryFee > 0 ? 'pending' : 'waived',
        registeredAt: new Date(),
        userId: req.user?._id ?? undefined,
        _id: undefined
    });

    await tournament.save();

    const reg = tournament.registrations[tournament.registrations.length - 1];
    res.status(201).json({
      success: true,
      message: `Team "${teamName}" registered successfully!`,
      registration: {
        id:          reg._id,
        teamName:    reg.teamName,
        captainName: reg.captainName,
        players:     reg.players.length,
        paymentStatus: reg.paymentStatus,
        entryFee:    tournament.entryFee,
        tournament:  tournament.title,
        date:        tournament.date,
        time:        tournament.time,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/tournaments/my — user's registrations across all tournaments
export const getMyRegistrations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tournaments = await Tournament.find({
      'registrations.userId': req.user!._id,
    }).select('title sport turfName date time prize status registrations');

    const myRegs = tournaments.flatMap(t =>
      t.registrations
        .filter(r => r.userId?.toString() === req.user!._id.toString())
        .map(r => ({
          tournamentId:   t._id,
          tournamentTitle:t.title,
          sport:          t.sport,
          turfName:       t.turfName,
          date:           t.date,
          time:           t.time,
          prize:          t.prize,
          tournamentStatus: t.status,
          teamName:       r.teamName,
          captainName:    r.captainName,
          players:        r.players,
          paymentStatus:  r.paymentStatus,
          registeredAt:   r.registeredAt,
        }))
    );

    res.json({ success: true, registrations: myRegs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Admin/Manager: POST /api/tournaments — create tournament
export const createTournament = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = { ...req.body };
    // Turf managers can only create tournaments for their assigned turf
    if (req.user?.role === 'turf_manager') {
      body.turfId = req.user.assignedTurfId;
    }
    const t = await Tournament.create(body);
    res.status(201).json({ success: true, tournament: t });
  } catch (err) {
    console.error('Create tournament error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Admin/Manager: PATCH /api/tournaments/:id — update tournament
export const updateTournament = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const t = await Tournament.findById(req.params.id);
    if (!t) { res.status(404).json({ success: false, message: 'Tournament not found' }); return; }

    // Turf managers can only update tournaments for their assigned turf
    if (req.user?.role === 'turf_manager' && t.turfId !== req.user.assignedTurfId) {
      res.status(403).json({ success: false, message: 'Access denied — not your branch tournament' });
      return;
    }

    const body = { ...req.body };
    // Prevent managers from changing the turfId
    if (req.user?.role === 'turf_manager') delete body.turfId;

    const updated = await Tournament.findByIdAndUpdate(req.params.id, body, { new: true });
    res.json({ success: true, tournament: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Admin/Manager: DELETE /api/tournaments/:id/registrations/:regId — remove a team
export const removeRegistration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) { res.status(404).json({ success: false, message: 'Tournament not found' }); return; }

    if (req.user?.role === 'turf_manager' && tournament.turfId !== req.user.assignedTurfId) {
      res.status(403).json({ success: false, message: 'Access denied — not your branch tournament' });
      return;
    }

    tournament.registrations = tournament.registrations.filter(
      r => r._id?.toString() !== req.params.regId
    ) as typeof tournament.registrations;
    await tournament.save();
    res.json({ success: true, message: 'Registration removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};