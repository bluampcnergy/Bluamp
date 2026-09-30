import paramiko
import uuid

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='YOUR_VPS_PASSWORD')

files = [
    "DC_Energy.png",
    "DC_Energy_white_bg.png",
    "DC_Energyfull_black_bg_.png",
    "DC_Full_battery_black_bg.png",
    "DC_Stamp.png"
]

sql_lines = []
for f in files:
    new_id = str(uuid.uuid4())
    sql_lines.append(
        f"INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata) "
        f"VALUES ('{new_id}', 'Logo', '{f}', NULL, NOW(), NOW(), '{{\"mimetype\": \"image/png\"}}') "
        f"ON CONFLICT (bucket_id, name) DO NOTHING;"
    )

sql_content = "\n".join(sql_lines)

stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres')
stdin.write(sql_content)
stdin.flush()
stdin.channel.shutdown_write()

print("Execution output:")
print(stdout.read().decode('utf-8'))

# Check object count now
stdin, stdout, stderr = client.exec_command('docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT count(*) FROM storage.objects WHERE bucket_id = \'Logo\';"')
print("Total count in Logo bucket:", stdout.read().decode('utf-8'))

client.close()

