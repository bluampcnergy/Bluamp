import urllib.request

urls = [
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/products/Cnergen_SLi_series_new.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/products/12.8V_100Ah.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Logo/products/daess.jpg"
]

print("Testing public URLs for product images:")
for url in urls:
    try:
        req = urllib.request.Request(url, method='HEAD')
        res = urllib.request.urlopen(req)
        print(f"[SUCCESS] {url} -> Status: {res.status}")
    except Exception as e:
        print(f"[ERROR] {url} -> Error: {e}")
