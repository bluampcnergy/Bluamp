import urllib.request
import json

service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"
url = "https://supabase.cnergy.co.in/rest/v1/employee_tasks?select=*&or=(completed.is.null,completed.eq.false)&order=due_date.asc.nullsfirst"

req = urllib.request.Request(url)
req.add_header("apikey", service_key)
req.add_header("Authorization", f"Bearer {service_key}")

try:
    with urllib.request.urlopen(req) as resp:
        tasks = json.loads(resp.read().decode('utf-8'))
        print(f"SUCCESS! Retrieved {len(tasks)} pending employee tasks using SERVICE_ROLE_KEY.")
        for t in tasks[:3]:
            print(f"- [{t.get('assigned_to')}] {t.get('title')}")
except Exception as e:
    print(f"ERROR: {e}")
