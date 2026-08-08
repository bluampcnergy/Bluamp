import urllib.request
import urllib.parse
import os

file_path = r'D:\downloads_may_august_26\Email_signature_3 (1).png'
if not os.path.exists(file_path):
    file_path = r'D:\downloads_may_august_26\Product drawings\Email_signature_3 (1).png'

with open(file_path, 'rb') as f:
    img_bytes = f.read()

print(f"Loaded signature file: {file_path} ({len(img_bytes)} bytes)")

service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

targets = [
    ('Logo', 'Email_signature_3 (1).png'),
    ('Logo', 'Email_signature_3.png'),
    ('Product drawings', 'Email_signature_3 (1).png'),
    ('Product drawings', 'Email_signature_3.png'),
]

for bucket, fn in targets:
    quoted_bucket = urllib.parse.quote(bucket)
    quoted_fn = urllib.parse.quote(fn)
    url = f"https://supabase.cnergy.co.in/storage/v1/object/{quoted_bucket}/{quoted_fn}"
    
    req = urllib.request.Request(url, data=img_bytes, method='POST')
    req.add_header('apikey', service_key)
    req.add_header('Authorization', f'Bearer {service_key}')
    req.add_header('Content-Type', 'image/png')
    req.add_header('x-upsert', 'true')
    
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Uploaded {fn} to bucket '{bucket}': status {resp.status}")
    except Exception as e:
        print(f"Failed to upload {fn} to bucket '{bucket}': {e}")
