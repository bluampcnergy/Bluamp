import urllib.request

urls = [
    "https://supabase.cnergy.co.in/storage/v1/object/public/Images/Template_label_new.png",
    "https://supabase.cnergy.co.in/storage/v1/object/public/Images/template_label_DTF.png"
]

print("Testing public URLs for Images bucket:")
for url in urls:
    try:
        req = urllib.request.Request(url, method='HEAD')
        res = urllib.request.urlopen(req)
        print(f"[SUCCESS] {url} -> Status: {res.status}")
    except Exception as e:
        print(f"[ERROR] {url} -> Error: {e}")
