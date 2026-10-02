# scripts/check-pwa.py (executar: python3 scripts/check-pwa.py)
import json, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parents[1]
html = (root/"index.html").read_text()
bad = [u for u in ["cdn.jsdelivr.net/npm/@tailwindcss/browser", "cdn.jsdelivr.net/npm/@tensorflow", "unpkg.com/lucide"] if u in html]
missing = [p for p in ["css/app.css","js/app.js","vendor/tf.min.js","vendor/coco-ssd.min.js","vendor/lucide.min.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png"] if not (root/p).exists()]
print("BAD_CDN:", bad or "none")
print("MISSING:", missing or "none")
manifest_err = None
try:
    d = json.loads((root/"manifest.webmanifest").read_text())
    assert d.get("display") == "standalone", "display deve ser standalone"
    assert d.get("lang") == "pt-BR", "lang deve ser pt-BR"
    assert d.get("theme_color") == "#05060a" and d.get("background_color") == "#05060a", "theme/background devem ser #05060a"
    assert d.get("orientation") == "portrait", "orientation deve ser portrait"
    assert 'rel="manifest"' in html, 'index.html sem rel="manifest"'
except Exception as e:
    manifest_err = str(e)
print("MANIFEST:", "OK" if not manifest_err else f"FAIL: {manifest_err}")
# Task 4: modelo cacheado + fallback sem-modelo
sw = (root/"sw.js").read_text()
appjs = (root/"js/app.js").read_text()
model_ok = "guia-visao-model-v1" in sw
fallback_ok = "SEM MODELO" in appjs and "startSim(); return" in appjs
print("MODEL-CACHE:", "OK" if model_ok else "FAIL: sw.js sem guia-visao-model-v1")
print("FALLBACK:", "OK" if fallback_ok else "FAIL: js/app.js sem fallback SEM MODELO")
sys.exit(1 if bad or missing or manifest_err or not model_ok or not fallback_ok else 0)
