from pathlib import Path
from PIL import Image

logo_path = Path("public/logo.png")
if not logo_path.exists():
    raise FileNotFoundError(f"{logo_path} not found")

img = Image.open(logo_path).convert("RGBA")
print("original size:", img.size)

size = 512
scale = size / max(img.size)
new_size = (round(img.width * scale), round(img.height * scale))
img = img.resize(new_size, Image.LANCZOS)
print("scaled size:", img.size)

canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
pos = ((size - img.width) // 2, (size - img.height) // 2)
canvas.paste(img, pos, img)
canvas.save(logo_path)
print("saved scaled square icon at", logo_path, "size", canvas.size)
