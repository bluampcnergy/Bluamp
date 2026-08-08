import urllib.request
import json

anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"

url = "https://supabase.cnergy.co.in/rest/v1/employee_tasks?select=*"

print("1. Testing with ANON KEY:")
req = urllib.request.Request(url)
req.add_header("apikey", anon_key)
req.add_header("Authorization", f"Bearer {anon_key}")
try:
    with urllib.request.urlopen(req) as resp:
        print("ANON Response:", resp.status, resp.read().decode('utf-8')[:200])
except Exception as e:
    print("ANON Error:", e)

print("\n2. Testing with SERVICE ROLE KEY:")
req2 = urllib.request.Request(url)
req2.add_header("apikey", service_key)
req2.add_header("Authorization", f"Bearer {service_key}")
try:
    with urllib.request.urlopen(req2) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("SERVICE ROLE Response:", resp.status, f"Found {len(data)} tasks")
except Exception as e:
    print("SERVICE ROLE Error:", e)
