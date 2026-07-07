from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
logo_path = root / "public" / "logo.png"
if not logo_path.exists():
    raise FileNotFoundError(f"Logo file not found: {logo_path}")

img = Image.open(logo_path).convert("RGBA")

for target_name in ["favicon.png", "logo.png"]:
    target_path = root / "public" / target_name
    if target_path.resolve() != logo_path.resolve():
        img.save(target_path)
        print(f"saved {target_path}")

ico_path = root / "public" / "favicon.ico"
img.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128)])
print(f"saved {ico_path}")
