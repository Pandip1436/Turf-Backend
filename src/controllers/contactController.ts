import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Contact from '../models/Contact';
import { sendContactAck } from '../utils/sendEmail';

// ── POST /api/contact
export const submitContact = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  try {
    const { name, email, phone, subject, message } = req.body as {
      name: string; email: string; phone?: string;
      subject?: string; message: string;
    };

    const contact = await Contact.create({
      name, email, phone,
      subject:   subject || 'General Enquiry',
      message,
      ipAddress: req.ip,
    });

    sendContactAck(email, name)
      .catch((e: Error) => console.error('Contact ack email failed:', e.message));

    res.status(201).json({
      success: true,
      message: 'Message received! We will contact you within 24 hours.',
      id: contact._id,
    });
  } catch (err) {
    console.error('Contact error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
