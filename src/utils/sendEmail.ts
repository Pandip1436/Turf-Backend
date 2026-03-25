import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface BookingEmailParams {
  to:         string;
  name:       string;
  bookingRef: string;
  date:       string;
  slots:      string[];
  total:      number;
}

export const sendBookingConfirmation = async (p: BookingEmailParams): Promise<void> => {
  if (!process.env.EMAIL_USER) return;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:2px">⚡ HYPERGREEN 360 TURF</h1>
        <p style="color:#bbf7d0;margin:8px 0 0">Booking Confirmation</p>
      </div>
      <div style="padding:32px">
        <p>Hi <strong>${p.name}</strong>,</p>
        <p style="color:#6b7280">Your slot is confirmed! See you on the field 🏆</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0">
          <table style="width:100%;font-size:14px">
            <tr><td style="color:#6b7280;padding:5px 0">Booking Ref</td>
                <td style="font-weight:700;color:#16a34a;text-align:right">${p.bookingRef}</td></tr>
            <tr><td style="color:#6b7280;padding:5px 0">Date</td>
                <td style="font-weight:600;text-align:right">${p.date}</td></tr>
            <tr><td style="color:#6b7280;padding:5px 0">Slots</td>
                <td style="font-weight:600;text-align:right">${p.slots.join(', ')}</td></tr>
            <tr><td style="color:#6b7280;padding:5px 0;border-top:1px solid #d1fae5">Total Paid</td>
                <td style="font-weight:800;color:#16a34a;text-align:right;border-top:1px solid #d1fae5">₹${p.total}</td></tr>
          </table>
        </div>
        <p style="font-size:13px;color:#6b7280">📍 Housing Board, Sivakasi – 626 123<br>📞 +91 80565 64775</p>
      </div>
      <div style="background:#f9fafb;padding:14px;text-align:center;font-size:12px;color:#9ca3af">
        © 2026 HyperGreen 360 Turf ·
        <a href="mailto:info@hypergreen360.com" style="color:#16a34a">info@hypergreen360.com</a>
      </div>
    </div>`;

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'HyperGreen 360 <info@hypergreen360.com>',
    to:      p.to,
    subject: `✅ Booking Confirmed – ${p.bookingRef} | HyperGreen 360 Turf`,
    html,
  });
};

export const sendContactAck = async (to: string, name: string): Promise<void> => {
  if (!process.env.EMAIL_USER) return;
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'HyperGreen 360 <info@hypergreen360.com>',
    to,
    subject: 'We received your message – HyperGreen 360 Turf',
    html: `<p>Hi <strong>${name}</strong>,<br><br>Thanks for reaching out! We'll reply within 24 hours.<br><br>— HyperGreen 360 Turf</p>`,
  });
};
