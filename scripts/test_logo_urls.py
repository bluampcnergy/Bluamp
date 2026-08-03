import urllib.request

urls = [
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Energy.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Energy_white_bg.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Energyfull_black_bg_.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Stamp.png"
]

print("Testing public URLs for uploaded logos:")
for url in urls:
    try:
        req = urllib.request.Request(url, method='HEAD')
        res = urllib.request.urlopen(req)
        print(f"[SUCCESS] {url} -> Status: {res.status}")
    except Exception as e:
        print(f"[ERROR] {url} -> Error: {e}")
