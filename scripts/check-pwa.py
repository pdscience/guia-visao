# scripts/check-pwa.py (executar: python3 scripts/check-pwa.py)
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parents[1]
html = (root/"index.html").read_text()
bad = [u for u in ["cdn.jsdelivr.net/npm/@tailwindcss/browser", "cdn.jsdelivr.net/npm/@tensorflow", "unpkg.com/lucide"] if u in html]
missing = [p for p in ["css/app.css","js/app.js","vendor/tf.min.js","vendor/coco-ssd.min.js","vendor/lucide.min.js"] if not (root/p).exists()]
print("BAD_CDN:", bad or "none")
print("MISSING:", missing or "none")
sys.exit(1 if bad or missing else 0)
