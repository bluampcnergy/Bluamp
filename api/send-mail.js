import nodemailer from 'nodemailer';

// Shared secret for authenticating internal API calls
// Set MAIL_API_SECRET in Vercel env vars. Frontend sends it as x-api-secret header.
const MAIL_API_SECRET = process.env.MAIL_API_SECRET || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Security: Verify the request is from our own app
  // If MAIL_API_SECRET is configured, require it. If not set (legacy), check Referer as fallback.
  if (MAIL_API_SECRET) {
    const clientSecret = req.headers['x-api-secret'];
    if (clientSecret !== MAIL_API_SECRET) {
      return res.status(403).json({ message: 'Forbidden: Invalid API secret' });
    }
  } else {
    // Fallback: Check Referer/Origin to at least block non-browser abuse
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowedOrigins = ['https://inventory.cnergy.co.in', 'http://localhost:3000', 'http://localhost:5173'];
    if (!allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return res.status(403).json({ message: 'Forbidden: Unauthorized origin' });
    }
  }

  const { to, subject, html, attachmentBase64, attachmentName } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ message: 'Missing required fields: to, subject' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || 'datlioncnergy@gmail.com',
        pass: process.env.GMAIL_PASS, // Configured in Vercel env
      },
    });

    const mailOptions = {
      from: `"Datlion Cnergy" <${process.env.GMAIL_USER || 'datlioncnergy@gmail.com'}>`,
      to,
      subject,
      html,
    };

    if (attachmentBase64) {
      // Split "data:application/pdf;filename=generated.pdf;base64,JVBERi..."
      const base64Data = attachmentBase64.split(',')[1] || attachmentBase64;
      mailOptions.attachments = [
        {
          filename: attachmentName || 'document.pdf',
          content: base64Data,
          encoding: 'base64'
        }
      ];
    }

    const info = await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
