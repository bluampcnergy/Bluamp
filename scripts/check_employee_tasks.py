import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

print("--- SELECT count(*), completed FROM employee_tasks ---")
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT count(*), completed FROM employee_tasks GROUP BY completed;"')
print(stdout.read().decode('utf-8'))

print("--- SELECT * FROM employee_tasks LIMIT 10 ---")
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT id, task_description, assigned_to, completed FROM employee_tasks LIMIT 10;"')
print(stdout.read().decode('utf-8'))

print("--- Testing Supabase API query using python ---")
import urllib.request, json
url = "https://supabase.cnergy.co.in/rest/v1/employee_tasks?select=id,assigned_to,completed&or=(completed.is.null,completed.eq.false)"
service_key = 'YOUR_SERVICE_KEY'
req = urllib.request.Request(url)
req.add_header('apikey', service_key)
req.add_header('Authorization', f'Bearer {service_key}')

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print(f"API Returned {len(res)} tasks via REST API: {res[:5]}")
except Exception as e:
    print(f"API Error: {e}")

client.close()

