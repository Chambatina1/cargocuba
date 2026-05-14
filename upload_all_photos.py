#!/usr/bin/env python3
"""Upload 3 car photos per driver to Render database."""
import base64, json, urllib.request, io, os, time
from PIL import Image

RENDER_URL = "https://cargocuba.onrender.com"
PHOTOS_DIR = "/home/z/my-project/download/driver-photos"

# Driver phone → photo files (profile, car1, car2, car3)
DRIVERS = {
    "5722044734": ["alain_camion.png", "alain_camion2.png", "alain_camion3.png"],
    "5352132015": ["boris_carro.png", "boris_carro2.png", "boris_carro3.png"],
    "5355748655": ["jorge_carro.png", "jorge_carro2.png", "jorge_carro3.png"],
    "7869426904": ["geo_carro.png", "geo_carro2.png", "geo_carro3.png"],
    "56153292":   ["vladimir_triciclo.png", "vladimir_triciclo2.png", "vladimir_triciclo3.png"],
}

def img_to_base64(filepath, size=(300, 300), quality=70):
    img = Image.open(filepath).convert("RGB")
    img = img.resize(size, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"

def get_provider_id(phone):
    url = f"{RENDER_URL}/api/providers/nearby"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read())
            for p in data:
                if p["phone"] == phone:
                    return p["id"]
    except Exception as e:
        print(f"  Error: {e}")
    return None

def upload_photos(provider_id, photo, cp1, cp2, cp3):
    url = f"{RENDER_URL}/api/providers/set-photo"
    payload = json.dumps({
        "providerId": provider_id,
        "photo": photo,
        "carPhoto1": cp1,
        "carPhoto2": cp2,
        "carPhoto3": cp3,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Upload error: {e}")
        return None

for phone, files in DRIVERS.items():
    print(f"\n--- {phone} ---")
    paths = [os.path.join(PHOTOS_DIR, f) for f in files]
    if not all(os.path.exists(p) for p in paths):
        missing = [f for f, p in zip(files, paths) if not os.path.exists(p)]
        print(f"  SKIP - missing files: {missing}")
        continue

    pid = get_provider_id(phone)
    if not pid:
        print(f"  SKIP - provider not found")
        continue

    print(f"  Provider ID: {pid}")
    print("  Converting images...")
    photo = img_to_base64(paths[0])
    cp1 = img_to_base64(paths[1])
    cp2 = img_to_base64(paths[2])
    # cp3: use profile photo as fallback since we only have 3 files
    cp3 = img_to_base64(paths[0])
    print(f"  photo={len(photo)}, cp1={len(cp1)}, cp2={len(cp2)}, cp3={len(cp3)}")

    print("  Uploading...")
    result = upload_photos(pid, photo, cp1, cp2, cp3)
    if result:
        print(f"  OK: {result}")
    else:
        print("  FAILED")

    time.sleep(2)

print("\n=== ALL DONE ===")
