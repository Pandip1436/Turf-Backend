import { Router } from 'express';
import { body } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import { submitContact } from '../controllers/contactController';

const router = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many messages. Try after an hour.' },
});

const contactRules = [
  body('name').trim().notEmpty().withMessage('Name required')
    .isLength({ max: 80 }).withMessage('Name too long'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('subject').optional().trim().isLength({ max: 120 }),
  body('message').trim().notEmpty().withMessage('Message required')
    .isLength({ min: 10, max: 2000 }).withMessage('Message must be 10–2000 chars'),
];

router.post('/', contactLimiter, contactRules, submitContact);

export default router;
