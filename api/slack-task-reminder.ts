import { createClient } from '@supabase/supabase-js';

const SUPABASE_VPS_URL = 'https://supabase.cnergy.co.in';
const SUPABASE_VPS_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(SUPABASE_VPS_URL, SUPABASE_VPS_SERVICE_KEY);

export async function buildTaskAssignmentReminderPayload(appUrl: string) {
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Fetch count of current active uncompleted tasks
  const { data: tasks, error } = await supabase
    .from('employee_tasks')
    .select('id, assigned_to')
    .or('completed.is.null,completed.eq.false');

  if (error) {
    console.error('[Slack Task Reminder] Error querying employee_tasks:', error);
    throw new Error(`Failed to query employee_tasks: ${error.message}`);
  }

  const validTasks = (tasks || []).filter(
    t => t.assigned_to && t.assigned_to.toLowerCase() !== 'general' && t.assigned_to.toLowerCase() !== 'chitale'
  );

  const pendingCount = validTasks.length;

  const tasksAppUrl = `${appUrl}/?view=employee_tasks`;

  return {
    text: `☀️ *Good Morning! 9:30 AM Task Assignment Reminder (${dateStr})*`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '☀️ Good Morning! Task Assignment Reminder',
          emoji: true
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⏰ *Mon–Sat 9:30 AM Reminder* | *Date:* ${dateStr}`
          }
        ]
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `👋 Please remember to **assign daily tasks to all employees** for today.\n\n📊 *Current System Status:* There are currently **${pendingCount} active uncompleted tasks** logged in Plant OS.`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📝 Assign Tasks in Plant OS',
              emoji: true
            },
            url: tasksAppUrl,
            style: 'primary'
          }
        ]
      }
    ]
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'https://inventory.cnergy.co.in';
    const personalWebhookUrl = process.env.SLACK_WEBHOOK_URL_PERSONAL || 
                               process.env.SLACK_WEBHOOK_URL_TO_DO || 
                               process.env.SLACK_WEBHOOK_URL;

    const targetWebhookUrl = req.body?.webhook_url || req.query?.webhook_url || personalWebhookUrl;

    const payload = await buildTaskAssignmentReminderPayload(appUrl);

    if (targetWebhookUrl) {
      const slackRes = await fetch(targetWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!slackRes.ok) {
        const errText = await slackRes.text();
        throw new Error(`Slack API error (${slackRes.status}): ${errText}`);
      }

      return res.status(200).json({
        success: true,
        message: '9:30 AM Task Assignment Reminder posted to Slack successfully!',
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(200).json({
        success: true,
        warning: 'No SLACK_WEBHOOK_URL_PERSONAL configured in environment variables.',
        instructions: 'Add SLACK_WEBHOOK_URL_PERSONAL to your Vercel Environment Variables to receive this message on your personal Slack.',
        payload
      });
    }
  } catch (err: any) {
    console.error('[Slack Task Reminder] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error', stack: err.stack, details: String(err) });
  }
}
