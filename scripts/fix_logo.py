from pathlib import Path
from PIL import Image

logo_path = Path("public/logo.png")
if not logo_path.exists():
    raise FileNotFoundError(f"{logo_path} not found")

img = Image.open(logo_path).convert("RGBA")
print("original size:", img.size)

size = 512
canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
max_dim = max(img.size)
if max_dim > size:
    scale = size / max_dim
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    print("resized to:", img.size)
pos = ((size - img.width) // 2, (size - img.height) // 2)
canvas.paste(img, pos, img)
canvas.save(logo_path)
print("saved squared icon at", logo_path, "size", canvas.size)
