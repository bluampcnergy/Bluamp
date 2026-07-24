import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { account, to, cc, subject, html, attachmentBase64, attachmentName } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ message: 'Missing required fields: to, subject' });
  }

  try {
    const smtpHost = account?.smtpHost || process.env.SMTP_HOST || 'mail.cnergy.co.in';
    const smtpPort = Number(account?.smtpPort) || Number(process.env.SMTP_PORT) || 465;
    const authUser = account?.username || account?.email || process.env.GMAIL_USER || 'sales@cnergy.co.in';
    const authPass = account?.password || process.env.GMAIL_PASS || '';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // SSL for 465, TLS/STARTTLS for 587
      auth: {
        user: authUser,
        pass: authPass,
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates if needed for private mail servers
      }
    });

    const senderEmail = account?.email || authUser;
    const senderName = account?.senderName || 'Datlion Cnergy Webmail';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to,
      cc: cc || undefined,
      subject,
      html,
    };

    if (attachmentBase64) {
      const base64Data = attachmentBase64.split(',')[1] || attachmentBase64;
      mailOptions.attachments = [
        {
          filename: attachmentName || 'attachment',
          content: base64Data,
          encoding: 'base64'
        }
      ];
    }

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('SMTP Mail Dispatch Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'SMTP Connection/Authentication Failed' 
    });
  }
}
