import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

sftp = client.open_sftp()

# Get Service Role Key from VPS .env
stdin, stdout, stderr = client.exec_command('grep "SERVICE_ROLE_KEY=" /root/supabase/docker/.env | cut -d= -f2')
service_key = stdout.read().decode('utf-8').strip()

print(f"Service Role Key obtained ({len(service_key)} chars)")

# Function to upload local folder files via Supabase Storage API on VPS
def upload_folder(local_dir, bucket_name, prefix=""):
    print(f"\n--- Uploading folder '{local_dir}' to bucket '{bucket_name}' (prefix: '{prefix}') ---")
    files = [f for f in os.listdir(local_dir) if os.path.isfile(os.path.join(local_dir, f))]
    
    # Create temp directory on VPS
    vps_temp_dir = f"/tmp/upload_{bucket_name}"
    client.exec_command(f"mkdir -p '{vps_temp_dir}'")
    
    for f in files:
        local_path = os.path.join(local_dir, f)
        vps_temp_path = f"{vps_temp_dir}/{f}"
        sftp.put(local_path, vps_temp_path)
        
        object_path = f"{prefix}/{f}" if prefix else f
        mimetype = "image/jpeg" if f.endswith((".jpg", ".jpeg")) else "image/png"
        
        # Execute curl to Supabase Storage API endpoint
        curl_cmd = f"""
        curl -s -X POST "http://localhost:8000/storage/v1/object/{bucket_name}/{object_path}" \\
          -H "Authorization: Bearer {service_key}" \\
          -H "Content-Type: {mimetype}" \\
          -H "x-upsert: true" \\
          --data-binary "@'{vps_temp_path}'"
        """
        stdin, stdout, stderr = client.exec_command(curl_cmd)
        res = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        print(f"Uploaded '{object_path}' -> Response: {res.strip()}")

# 1. Upload Logo files
upload_folder(r"C:\Users\indra\Downloads\Logo", "Logo")

# 2. Upload Logo product files
upload_folder(r"C:\Users\indra\Downloads\Logo\products", "Logo", prefix="products")

# 3. Upload Images files
upload_folder(r"C:\Users\indra\Downloads\Images", "Images")

sftp.close()
client.close()
print("\nALL ASSETS UPLOADED VIA STORAGE API SUCCESSFULLY!")
