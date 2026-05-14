#!/usr/bin/env python3
"""Resize car photos, convert to base64, and upload to Render database."""
import base64, json, urllib.request, io, os
from PIL import Image

RENDER_URL = "https://cargocuba.onrender.com"
PHOTOS_DIR = "/home/z/my-project/download/driver-photos"

# Driver phone → photo file mapping
DRIVERS = {
    "5722044734": "alain_camion.png",        # Alain Valle
    "5352132015": "boris_carro.png",          # Boris
    "5355748655": "jorge_carro.png",          # Jorge Luis
    "7869426904": "geo_carro.png",            # Geo (Georguiv)
    "56153292": "vladimir_triciclo.png",      # Vladimir
}

def process_image(filepath, size=(300, 300), quality=80):
    """Resize image and convert to base64 JPEG."""
    img = Image.open(filepath).convert("RGB")
    img = img.resize(size, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def get_provider_id_by_phone(phone):
    """Find provider ID from Render API by phone."""
    url = f"{RENDER_URL}/api/providers/nearby"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            for p in data:
                if p["phone"] == phone:
                    return p["id"]
    except Exception as e:
        print(f"  Error fetching providers: {e}")
    return None

def upload_photo(provider_id, photo_b64):
    """Upload photo to provider via PUT API."""
    url = f"{RENDER_URL}/api/providers/{provider_id}"
    payload = json.dumps({
        "pin": "1234",
        "photo": photo_b64
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PUT")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return True
    except Exception as e:
        print(f"  Upload error: {e}")
        return False

# Process each driver
for phone, filename in DRIVERS.items():
    filepath = os.path.join(PHOTOS_DIR, filename)
    if not os.path.exists(filepath):
        print(f"SKIP {phone} - file not found: {filename}")
        continue
    
    print(f"\nProcessing {phone} ({filename})...")
    
    # Resize and convert
    print("  Resizing and converting to base64...")
    photo_b64 = process_image(filepath, size=(300, 300), quality=75)
    print(f"  Base64 length: {len(photo_b64)} chars")
    
    # Find provider ID
    print("  Finding provider ID...")
    provider_id = get_provider_id_by_phone(phone)
    if not provider_id:
        print(f"  ERROR: Provider not found for phone {phone}")
        continue
    print(f"  Provider ID: {provider_id}")
    
    # Upload
    print("  Uploading photo...")
    success = upload_photo(provider_id, photo_b64)
    if success:
        print(f"  SUCCESS: Photo uploaded for {phone}")
    else:
        print(f"  FAILED: Could not upload photo")

print("\n=== DONE ===")
