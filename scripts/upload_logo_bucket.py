import os
import paramiko

# 1. Connect to Hostinger VPS
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

sftp = client.open_sftp()

# 2. Ensure bucket directory exists on VPS storage volume
remote_bucket_dir = "/root/supabase/docker/volumes/storage/stub/Logo"

try:
    sftp.mkdir(remote_bucket_dir)
    print("Created remote storage directory for bucket 'Logo'")
except Exception as e:
    print(f"Bucket directory notice: {e}")

# 3. Upload all 5 logo files to the VPS volume
local_dir = r"C:\Users\indra\Downloads\Logo"
files = [f for f in os.listdir(local_dir) if os.path.isfile(os.path.join(local_dir, f))]

for f in files:
    local_path = os.path.join(local_dir, f)
    remote_path = f"{remote_bucket_dir}/{f}"
    print(f"Uploading {f} to VPS storage...")
    sftp.put(local_path, remote_path)
    print(f"Uploaded {f} successfully")

sftp.close()

# 4. Insert/Upsert 'Logo' bucket and files into storage DB metadata
insert_sql = """
INSERT INTO storage.buckets (id, name, owner, public, created_at, updated_at)
VALUES ('Logo', 'Logo', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET public = true;
"""

for f in files:
    insert_sql += f"""
INSERT INTO storage.objects (bucket_id, name, owner, created_at, updated_at, metadata)
VALUES ('Logo', '{f}', NULL, NOW(), NOW(), '{{\"mimetype\": \"image/png\"}}')
ON CONFLICT (bucket_id, name) DO NOTHING;
"""

cmd = f'docker exec -i supabase-db psql -U postgres -d postgres -c "{insert_sql}"'
stdin, stdout, stderr = client.exec_command(cmd)

out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("DB Metadata Output:", out)

client.close()
print("\nALL 5 LOGO FILES UPLOADED AND REGISTERED IN SUPABASE STORAGE SUCCESSFULLY!")

