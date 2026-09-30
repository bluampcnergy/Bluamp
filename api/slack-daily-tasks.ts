import { createClient } from '@supabase/supabase-js';

const SUPABASE_VPS_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_VPS_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_VPS_URL, SUPABASE_VPS_SERVICE_KEY);

// Helper for due date priority colors & emoji
function getDueDateBadge(dueDate?: string) {
  if (!dueDate) return { emoji: '⚪', label: 'No Due Date' };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return { emoji: '🚨', label: `OVERDUE (${dueDate})` };
  if (diffDays === 0) return { emoji: '🔴', label: `DUE TODAY (${dueDate})` };
  if (diffDays <= 7) return { emoji: '🟡', label: `Due Soon (${dueDate})` };
  if (diffDays <= 30) return { emoji: '🔵', label: `Due Later (${dueDate})` };
  return { emoji: '⚪', label: `Due (${dueDate})` };
}

export async function buildSlackTaskDigestPayload(appUrl: string, requestedUser?: string) {
  const { data: tasks, error } = await supabase
    .from('employee_tasks')
    .select('*')
    .or('completed.is.null,completed.eq.false')
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }

  // Filter out legacy system names
  const validTasks = (tasks || []).filter(
    t => t.assigned_to !== 'general' && t.assigned_to !== 'chitale'
  );

  let filteredTasks = validTasks;
  if (requestedUser && requestedUser !== 'all') {
    filteredTasks = validTasks.filter(t => t.assigned_to.toLowerCase() === requestedUser.toLowerCase());
  }

  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  if (filteredTasks.length === 0) {
    return {
      text: `🎉 *Datlion Cnergy - Daily To-Do Digest (${dateStr})*\n\nAll tasks are completed! No pending items.`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎉 Datlion Cnergy - Daily To-Do Digest',
            emoji: true
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📅 *11:30 AM Daily Digest* | ${dateStr}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✨ *Great news!* There are currently *0 pending to-do tasks*. All clear!'
          }
        }
      ]
    };
  }

  // Group tasks by assigned employee
  const tasksByEmployee: Record<string, typeof filteredTasks> = {};
  filteredTasks.forEach(task => {
    const emp = task.assigned_to || 'Unassigned';
    if (!tasksByEmployee[emp]) tasksByEmployee[emp] = [];
    tasksByEmployee[emp].push(task);
  });

  const totalPending = filteredTasks.length;
  const overdueCount = filteredTasks.filter(t => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date);
    due.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return due < today;
  }).length;

  const dueTodayCount = filteredTasks.filter(t => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date);
    due.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return due.getTime() === today.getTime();
  }).length;

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📋 Datlion Cnergy — Daily To-Do Digest',
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `⏰ *Automated 11:30 AM Digest* | *Date:* ${dateStr} | *Pending Tasks:* ${totalPending} (${dueTodayCount} due today, ${overdueCount} overdue)`
        }
      ]
    },
    { type: 'divider' }
  ];

  // Add section for each employee
  Object.keys(tasksByEmployee).sort().forEach(emp => {
    const empTasks = tasksByEmployee[emp];
    let taskListText = `*👤 Employee: ${emp}* (${empTasks.length} pending)\n`;

    empTasks.forEach((t, idx) => {
      const badge = getDueDateBadge(t.due_date);
      taskListText += `• ${badge.emoji} *${t.title}* — _${badge.label}_`;
      if (t.description) {
        taskListText += `\n   ↳ ${t.description}`;
      }
      taskListText += `\n`;
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: taskListText
      }
    });
  });

  // Action button to open tasks app on phone/desktop
  const tasksAppUrl = `${appUrl}/?view=employee_tasks`;
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📱 Open Tasks in Plant OS App',
          emoji: true
        },
        url: tasksAppUrl,
        style: 'primary'
      }
    ]
  });

  return {
    text: `📋 *Datlion Cnergy - Daily To-Do Tasks (${totalPending} pending)*`,
    blocks
  };
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'https://inventory.cnergy.co.in';
    const defaultWebhookUrl = process.env.SLACK_WEBHOOK_URL_TO_DO || process.env.SLACK_WEBHOOK_URL || process.env.SLACK_TASKS_WEBHOOK_URL;

    // Check if called with custom webhook URL from request body or query
    const targetWebhookUrl = req.body?.webhook_url || req.query?.webhook_url || defaultWebhookUrl;
    const requestedUser = req.body?.user || req.query?.user;

    const payload = await buildSlackTaskDigestPayload(appUrl, requestedUser);

    // If request contains response_url from Slack slash command (e.g. /tasks)
    const responseUrl = req.body?.response_url;

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
        message: 'Daily task digest successfully broadcasted to Slack!',
        timestamp: new Date().toISOString()
      });
    } else if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, response_type: 'in_channel' })
      });

      return res.status(200).send('OK');
    } else {
      // If no webhook URL is set in env vars yet, return the generated JSON payload so caller can view/test it
      return res.status(200).json({
        success: true,
        warning: 'No SLACK_WEBHOOK_URL configured in environment variables.',
        instructions: 'Add SLACK_WEBHOOK_URL to your Vercel Environment Variables to automatically post to Slack at 11:30 AM daily.',
        payload
      });
    }
  } catch (err: any) {
    console.error('[Slack Daily Tasks] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}


