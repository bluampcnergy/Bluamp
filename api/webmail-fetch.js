import { ImapFlow } from 'imapflow';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { account, mode = 'fetch' } = req.body;

  const imapHost = account?.imapHost || 'mail.cnergy.co.in';
  const imapPort = Number(account?.imapPort) || 993;
  const authUser = account?.username || account?.email;
  const authPass = account?.password || '';

  if (!authUser || !authPass) {
    return res.status(400).json({ 
      success: false, 
      error: 'Password or username is missing. Please enter your email password in Webmail Settings.' 
    });
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: {
      user: authUser,
      pass: authPass,
    },
    tls: {
      rejectUnauthorized: false
    },
    logger: false
  });

  try {
    await client.connect();

    if (mode === 'test') {
      await client.logout();
      return res.status(200).json({
        success: true,
        message: `Successfully connected and authenticated to ${imapHost}:${imapPort} as ${authUser}!`
      });
    }

    // Open Inbox
    const lock = await client.getMailboxLock('INBOX');
    const fetchedEmails = [];

    try {
      // Fetch last 15 messages
      const status = await client.status('INBOX', { messages: true });
      const total = status.messages || 0;
      const startSeq = Math.max(1, total - 14);
      const searchRange = `${startSeq}:${total}`;

      for await (let message of client.fetch(searchRange, { envelope: true, bodyStructure: true, source: true })) {
        const envelope = message.envelope;
        const fromAddr = envelope.from?.[0] 
          ? `${envelope.from[0].name || ''} <${envelope.from[0].address || ''}>`.trim() 
          : 'Unknown Sender';

        const toAddr = envelope.to?.[0]?.address || account?.email || authUser;

        fetchedEmails.push({
          id: `imap-${message.uid || message.seq}`,
          accountEmail: account?.email || authUser,
          folder: 'inbox',
          from: fromAddr,
          to: toAddr,
          subject: envelope.subject || '(No Subject)',
          date: envelope.date ? new Date(envelope.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : new Date().toLocaleString(),
          timestamp: envelope.date ? new Date(envelope.date).getTime() : Date.now(),
          snippet: envelope.subject || 'IMAP Message Received',
          bodyHtml: `<div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
            <p><strong>Subject:</strong> ${envelope.subject || '(No Subject)'}</p>
            <p><strong>From:</strong> ${fromAddr}</p>
            <p><strong>Date:</strong> ${envelope.date}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;"/>
            <p style="white-space: pre-wrap;">Message fetched live via IMAP from ${imapHost}.</p>
          </div>`,
          isUnread: !(message.flags?.has('\\Seen')),
          isStarred: Boolean(message.flags?.has('\\Flagged')),
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return res.status(200).json({ success: true, emails: fetchedEmails.reverse() });

  } catch (error) {
    console.error('IMAP Fetch/Test Error:', error);
    try { await client.logout(); } catch (e) {}
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to IMAP server. Check host, port, and credentials.' 
    });
  }
}
