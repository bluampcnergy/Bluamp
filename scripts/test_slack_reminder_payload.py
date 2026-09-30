import urllib.request
import json

url = 'https://supabase.cnergy.co.in/rest/v1/employee_tasks?select=id,assigned_to,completed&or=(completed.is.null,completed.eq.false)'
service_key = 'YOUR_SERVICE_KEY'

req = urllib.request.Request(url, headers={'apikey': service_key, 'Authorization': f'Bearer {service_key}'})
with urllib.request.urlopen(req) as resp:
    tasks = json.loads(resp.read().decode())

valid_tasks = [t for t in tasks if t.get('assigned_to') and t.get('assigned_to').lower() not in ['general', 'chitale']]
pending_count = len(valid_tasks)

print(f"Total uncompleted tasks in DB: {len(tasks)}")
print(f"Pending tasks count for Slack 9:30 AM Reminder: {pending_count}")

# Print sample Slack section payload text
slack_text = f"👋 Please remember to **assign daily tasks to all employees** for today.\n\n📊 *Current System Status:* There are currently **{pending_count} active uncompleted tasks** logged in Plant OS."
print("\nGenerated Slack Message Section:")
print(slack_text)

