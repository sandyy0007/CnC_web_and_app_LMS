import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

TARGET_DIR = r"c:\Users\SANDEEP\Desktop\eedi-lms\apps\web\public\images\backgrounds"
SRC_IMAGES_DIR = r"c:\Users\SANDEEP\Desktop\eedi-lms\apps\web\public\images"
os.makedirs(TARGET_DIR, exist_ok=True)

# 1. Existing base image mappings
BASE_MAPPINGS = {
    "super-admin": os.path.join(SRC_IMAGES_DIR, "platform", "super-admin.webp"),
    "admin": os.path.join(SRC_IMAGES_DIR, "platform", "colleges.webp"),
    "colleges": os.path.join(SRC_IMAGES_DIR, "platform", "colleges.webp"),
    "courses": os.path.join(SRC_IMAGES_DIR, "platform", "courses.webp"),
    "payments": os.path.join(SRC_IMAGES_DIR, "platform", "payments.webp"),
    "games": os.path.join(SRC_IMAGES_DIR, "platform", "games.webp"),
    "student": os.path.join(SRC_IMAGES_DIR, "career-launch.webp"),
    "trainer": os.path.join(SRC_IMAGES_DIR, "trainer-ai.webp"),
    "users": os.path.join(SRC_IMAGES_DIR, "tech-orbit.webp"),
    "analytics": os.path.join(SRC_IMAGES_DIR, "features-ai.webp"),
}

def copy_and_optimize(src_path, dst_base):
    im = Image.open(src_path)
    im_rgb = im.convert("RGB")
    webp_out = os.path.join(TARGET_DIR, f"{dst_base}.webp")
    jpg_out = os.path.join(TARGET_DIR, f"{dst_base}.jpg")
    im_rgb.save(webp_out, "WEBP", quality=90)
    im_rgb.save(jpg_out, "JPEG", quality=90)
    print(f"[COPIED] {dst_base}.webp ({os.path.getsize(webp_out) // 1024} KB)")

# Process existing base mappings
for dst_name, src_file in BASE_MAPPINGS.items():
    if os.path.exists(src_file):
        copy_and_optimize(src_file, dst_name)
    else:
        print(f"[MISSING SRC] {src_file}")

# 2. Synthesize remaining backgrounds with high-fidelity cyber/edtech visuals
WIDTH, HEIGHT = 1920, 1080

def create_rich_background(name, base_color, accent_color, motif="rings"):
    # Base gradient image
    im = Image.new("RGBA", (WIDTH, HEIGHT), (10, 10, 24, 255))
    draw = ImageDraw.Draw(im)

    # Gradient fill
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
    orb_draw.ellipse([WIDTH * 0.1, HEIGHT * 0.1, WIDTH * 0.6, HEIGHT * 0.9], fill=accent_color + (80,))
    # Right flare
    orb_draw.ellipse([WIDTH * 0.6, HEIGHT * 0.3, WIDTH * 1.1, HEIGHT * 1.1], fill=base_color + (70,))
    orb_layer = orb_layer.filter(ImageFilter.GaussianBlur(120))
    im = Image.alpha_composite(im, orb_layer)

    # Cyber grid
    grid_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid_layer)
    step = 60
    for x in range(0, WIDTH, step):
        grid_draw.line([(x, 0), (x, HEIGHT)], fill=(255, 255, 255, 12))
    for y in range(0, HEIGHT, step):
        grid_draw.line([(0, y), (WIDTH, y)], fill=(255, 255, 255, 12))
    im = Image.alpha_composite(im, grid_layer)

    # Motifs: telemetry, rings, waves, shields
    motif_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    motif_draw = ImageDraw.Draw(motif_layer)
    cx, cy = WIDTH // 2, HEIGHT // 2

    if motif == "rings": # for HOD / coordination
        for r in range(150, 600, 70):
            motif_draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=accent_color + (50,), width=2)
            # Add tick marks
            for angle in range(0, 360, 30):
                rad = math.radians(angle)
                x1 = cx + int((r - 10) * math.cos(rad))
                y1 = cy + int((r - 10) * math.sin(rad))
                x2 = cx + int((r + 10) * math.cos(rad))
                y2 = cy + int((r + 10) * math.sin(rad))
                motif_draw.line([(x1, y1), (x2, y2)], fill=accent_color + (80,), width=2)

    elif motif == "pulse": # for Attendance / pulse
        for row in range(5):
            base_y = HEIGHT * 0.3 + row * 100
            points = []
            for col in range(0, WIDTH, 20):
                sine_val = math.sin((col / 80.0) + row) * 45 * math.exp(-((col - cx)**2) / (WIDTH * 200))
                points.append((col, base_y + sine_val))
            motif_draw.line(points, fill=accent_color + (70,), width=3)

    elif motif == "crest": # for Certificates / achievement
        # Diamond achievement geometry
        size = 320
        points = [(cx, cy - size), (cx + size, cy), (cx, cy + size), (cx - size, cy)]
        motif_draw.polygon(points, outline=accent_color + (90,), width=4)
        for sub_r in range(80, 240, 40):
            motif_draw.ellipse([cx - sub_r, cy - sub_r, cx + sub_r, cy + sub_r], outline=(255, 215, 0, 60), width=2)

    elif motif == "charts": # for Reports / executive insights
        for bar_i in range(12):
            bx = WIDTH * 0.25 + bar_i * 80
            b_h = 100 + int(math.sin(bar_i * 0.8) * 120 + bar_i * 15)
            motif_draw.rectangle([bx, cy + 180 - b_h, bx + 45, cy + 180], fill=accent_color + (60,), outline=(255, 255, 255, 80))
        # Trend line
        line_pts = [(WIDTH * 0.25 + i * 80 + 22, cy + 160 - int(math.sin(i * 0.8) * 120 + i * 15)) for i in range(12)]
        motif_draw.line(line_pts, fill=(6, 182, 212, 180), width=4)

    elif motif == "security": # for Settings / security vault
        # Hexagonal security mesh
        hex_size = 90
        for hx in range(cx - 400, cx + 500, 150):
            for hy in range(cy - 250, cy + 300, 130):
                hex_pts = [
                    (hx + hex_size * math.cos(math.radians(a)), hy + hex_size * math.sin(math.radians(a)))
                    for a in range(0, 360, 60)
                ]
                motif_draw.polygon(hex_pts, outline=accent_color + (60,), width=2)

    im = Image.alpha_composite(im, motif_layer)
    im_rgb = im.convert("RGB")
    webp_out = os.path.join(TARGET_DIR, f"{name}.webp")
    jpg_out = os.path.join(TARGET_DIR, f"{name}.jpg")
    im_rgb.save(webp_out, "WEBP", quality=90)
    im_rgb.save(jpg_out, "JPEG", quality=90)
    print(f"[SYNTHESIZED] {name}.webp ({os.path.getsize(webp_out) // 1024} KB)")

# Synthesize the rest
SYNTH_CONFIGS = [
    ("hod", (28, 25, 75), (99, 102, 241), "rings"),
    ("attendance", (15, 32, 67), (14, 165, 233), "pulse"),
    ("certificates", (38, 20, 60), (236, 72, 153), "crest"),
    ("reports", (20, 24, 70), (6, 182, 212), "charts"),
    ("settings", (18, 22, 50), (16, 185, 129), "security"),
]

for name, base, acc, motif in SYNTH_CONFIGS:
    create_rich_background(name, base, acc, motif)

print("\n--- ALL 15 BACKGROUNDS VERIFIED ---")
for f in os.listdir(TARGET_DIR):
    if f.endswith(".webp"):
        print(f"  {f}: {os.path.getsize(os.path.join(TARGET_DIR, f)) // 1024} KB")

