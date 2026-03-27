import { Router } from 'express';
import { body } from 'express-validator';
import {
  getTournaments,
  getTournamentById,
  registerTeam,
  getMyRegistrations,
  createTournament,
  updateTournament,
  removeRegistration,
} from '../controllers/tournamentController';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth';

const router = Router();

const registerRules = [
  body('teamName').trim().notEmpty().withMessage('Team name required'),
  body('captainName').trim().notEmpty().withMessage('Captain name required'),
  body('captainEmail').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('captainPhone').matches(/^[0-9]{10}$/).withMessage('10-digit phone required'),
  body('players').isArray({ min: 1 }).withMessage('Players array required'),
  body('players.*.name').trim().notEmpty().withMessage('Each player must have a name'),
];

// Public
router.get('/',              optionalAuth, getTournaments);
router.get('/my',            authenticate, getMyRegistrations);
router.get('/:id',           optionalAuth, getTournamentById);

// Authenticated
router.post('/:id/register', optionalAuth, registerRules, registerTeam);

// Admin only
router.post('/',                              authenticate, requireAdmin, createTournament);
router.patch('/:id',                          authenticate, requireAdmin, updateTournament);
router.delete('/:id/registrations/:regId',    authenticate, requireAdmin, removeRegistration);

export default router;