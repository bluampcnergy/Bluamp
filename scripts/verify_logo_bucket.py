import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('200.141.9.217', username='root', password='Tatwamasi@01')

cmd = 'docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT id, bucket_id, name, created_at FROM storage.objects WHERE bucket_id = \'Logo\';"'
stdin, stdout, stderr = client.exec_command(cmd)

print("Registered storage objects in 'Logo' bucket:")
print(stdout.read().decode('utf-8'))

client.close()
