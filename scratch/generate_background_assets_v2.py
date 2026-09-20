import os
import math
from PIL import Image, ImageDraw, ImageFilter

TARGET_DIR = r"c:\Users\SANDEEP\Desktop\eedi-lms\apps\web\public\images\backgrounds"
SRC_IMAGES_DIR = r"c:\Users\SANDEEP\Desktop\eedi-lms\apps\web\public\images"
os.makedirs(TARGET_DIR, exist_ok=True)

WIDTH, HEIGHT = 1920, 1080

def create_rich_background(name, base_color, accent_color, motif="rings"):
    # Base gradient image
    im = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 28, 255))
    draw = ImageDraw.Draw(im)

    # Vertical subtle gradient
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(base_color[0] * (1 - ratio * 0.7))
        g = int(base_color[1] * (1 - ratio * 0.7))
        b = int(base_color[2] * (1 - ratio * 0.7))
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

    # Glow orbs
    orb_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    orb_draw = ImageDraw.Draw(orb_layer)
    
    # Left flare
    orb_draw.ellipse([WIDTH * 0.1, HEIGHT * 0.1, WIDTH * 0.65, HEIGHT * 0.9], fill=accent_color + (85,))
    # Right flare
    orb_draw.ellipse([WIDTH * 0.55, HEIGHT * 0.25, WIDTH * 1.15, HEIGHT * 1.15], fill=base_color + (75,))
    orb_layer = orb_layer.filter(ImageFilter.GaussianBlur(120))
    im = Image.alpha_composite(im, orb_layer)

    # Cyber tech grid
    grid_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid_layer)
    step = 55
    for x in range(0, WIDTH, step):
        grid_draw.line([(x, 0), (x, HEIGHT)], fill=(255, 255, 255, 12))
    for y in range(0, HEIGHT, step):
        grid_draw.line([(0, y), (WIDTH, y)], fill=(255, 255, 255, 12))
    im = Image.alpha_composite(im, grid_layer)

    # Motif layer
    motif_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    motif_draw = ImageDraw.Draw(motif_layer)
    cx, cy = WIDTH // 2, HEIGHT // 2

    if motif == "syllabus":  # For course-detail
        for i in range(7):
            bx = 180 + i * 240
            by = 200 + (i % 3) * 120
            motif_draw.rounded_rectangle([bx, by, bx + 180, by + 120], radius=16, outline=accent_color + (60,), width=2)
            motif_draw.line([(bx + 90, by + 120), (bx + 210, by + 220)], fill=accent_color + (40,), width=2)

    elif motif == "enrollment":  # For enrollments
        for i in range(12):
            angle = i * (2 * math.pi / 12)
            r = 380 + (i % 2) * 80
            px = int(cx + r * math.cos(angle))
            py = int(cy + r * math.sin(angle) * 0.6)
            motif_draw.ellipse([px - 18, py - 18, px + 18, py + 18], fill=accent_color + (70,), outline=(255, 255, 255, 80), width=2)
            motif_draw.line([(cx, cy), (px, py)], fill=accent_color + (30,), width=1)
        motif_draw.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], fill=accent_color + (100,), outline=(255, 255, 255, 120), width=3)

    elif motif == "live_class":  # For live-class
        for r in range(120, 560, 90):
            motif_draw.arc([cx - r, cy - r, cx + r, cy + r], start=-60, end=60, fill=accent_color + (90,), width=3)
            motif_draw.arc([cx - r, cy - r, cx + r, cy + r], start=120, end=240, fill=accent_color + (90,), width=3)
        motif_draw.rounded_rectangle([cx - 100, cy - 65, cx + 100, cy + 65], radius=20, outline=accent_color + (120,), width=3)

    elif motif == "profile":  # For profile
        for r in range(160, 520, 75):
            motif_draw.ellipse([cx - r, cy - int(r * 0.65), cx + r, cy + int(r * 0.65)], outline=accent_color + (45,), width=2)
        motif_draw.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=accent_color + (80,), outline=(255, 255, 255, 100), width=3)

    elif motif == "notification":  # For notifications
        for r in range(140, 600, 80):
            motif_draw.arc([cx - r, cy - r, cx + r, cy + r], start=180, end=360, fill=accent_color + (75,), width=2)
            motif_draw.ellipse([cx + r - 8, cy - 8, cx + r + 8, cy + 8], fill=accent_color + (110,))

    motif_layer = motif_layer.filter(ImageFilter.GaussianBlur(1))
    im = Image.alpha_composite(im, motif_layer)

    # Save outputs
    webp_out = os.path.join(TARGET_DIR, f"{name}.webp")
    jpg_out = os.path.join(TARGET_DIR, f"{name}.jpg")
    im_rgb = im.convert("RGB")
    im_rgb.save(webp_out, "WEBP", quality=90)
    im_rgb.save(jpg_out, "JPEG", quality=90)
    print(f"[CREATED] {name}.webp ({os.path.getsize(webp_out) // 1024} KB)")

# Generate the 5 missing backgrounds
NEW_BACKGROUNDS = [
    ("course-detail", (30, 45, 100), (37, 99, 235), "syllabus"),
    ("enrollments", (20, 60, 85), (6, 182, 212), "enrollment"),
    ("live-class", (70, 20, 95), (236, 72, 153), "live_class"),
    ("profile", (40, 25, 95), (147, 51, 234), "profile"),
    ("notifications", (80, 50, 20), (245, 158, 11), "notification"),
]

for name, base_col, acc_col, motif in NEW_BACKGROUNDS:
    create_rich_background(name, base_col, acc_col, motif)

print("\n--- Verification of all 20 backgrounds ---")
REQUIRED = [
    "super-admin", "admin", "hod", "trainer", "student",
    "courses", "course-detail", "payments", "games", "analytics",
    "attendance", "colleges", "users", "enrollments", "certificates",
    "reports", "settings", "live-class", "profile", "notifications"
]

missing = []
for req in REQUIRED:
    path = os.path.join(TARGET_DIR, f"{req}.webp")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print(f"✓ {req}.webp ({os.path.getsize(path) // 1024} KB)")
    else:
        missing.append(req)

if missing:
    print(f"FAILED: Missing {missing}")
else:
    print(f"SUCCESS: All {len(REQUIRED)} background images exist and are ready!")

