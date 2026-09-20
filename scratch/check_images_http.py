import urllib.request

images = [
    'super-admin.webp', 'admin.webp', 'hod.webp', 'trainer.webp', 'student.webp',
    'courses.webp', 'course-detail.webp', 'payments.webp', 'games.webp', 'analytics.webp',
    'attendance.webp', 'colleges.webp', 'users.webp', 'enrollments.webp', 'certificates.webp',
    'reports.webp', 'settings.webp', 'live-class.webp', 'profile.webp', 'notifications.webp'
]

success = 0
for img in images:
    url = f"http://localhost:3000/images/backgrounds/{img}"
    try:
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req, timeout=3) as res:
            ct = res.headers.get('Content-Type', '')
            print(f"[OK] {img:22} -> Status {res.status} ({ct})")
            success += 1
    except Exception as e:
        print(f"[FAIL] {img:22} -> {e}")

print(f"\nTotal: {success}/{len(images)} images successfully verified over HTTP 200.")

