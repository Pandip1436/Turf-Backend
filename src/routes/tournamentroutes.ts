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
  uploadTournamentBanner,
} from '../controllers/tournamentController';
import { authenticate, requireAdminOrManager, optionalAuth } from '../middleware/auth';
import { uploadTournamentSingle } from '../middleware/upload';

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

// Admin or Branch Manager
router.post('/upload',                        authenticate, requireAdminOrManager, uploadTournamentSingle, uploadTournamentBanner);
router.post('/',                              authenticate, requireAdminOrManager, createTournament);
router.patch('/:id',                          authenticate, requireAdminOrManager, updateTournament);
router.delete('/:id/registrations/:regId',    authenticate, requireAdminOrManager, removeRegistration);

export default router;