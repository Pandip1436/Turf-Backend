import { Response } from 'express';
import Tournament from '../models/Tournament';
import { AuthRequest } from '../types';

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

// ── Admin: POST /api/tournaments — create tournament
export const createTournament = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const t = await Tournament.create(req.body);
    res.status(201).json({ success: true, tournament: t });
  } catch (err) {
    console.error('Create tournament error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Admin: PATCH /api/tournaments/:id — update tournament
export const updateTournament = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const t = await Tournament.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) { res.status(404).json({ success: false, message: 'Tournament not found' }); return; }
    res.json({ success: true, tournament: t });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Admin: DELETE /api/tournaments/:id/registrations/:regId — remove a team
export const removeRegistration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) { res.status(404).json({ success: false, message: 'Tournament not found' }); return; }
    tournament.registrations = tournament.registrations.filter(
      r => r._id?.toString() !== req.params.regId
    ) as typeof tournament.registrations;
    await tournament.save();
    res.json({ success: true, message: 'Registration removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};