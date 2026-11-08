#!/usr/bin/env python3
"""Build Kitphonic launcher, splash, and favicon rasters from the approved master.

The master is the owner-selected original speaking-book PNG. This script only
resamples that file. It does not redraw the artwork and it does not emit a vector.

  python3 tools/build-app-icon.py           # write repo outputs
  python3 tools/build-app-icon.py --check   # fail if committed outputs differ
  python3 tools/build-app-icon.py --previews DIR
"""
import hashlib, io, json, sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTER_REL = "icons/symbol-1024.png"
MASTER_SHA = "4a45274b45d588c5b697b72a7d16e4aeb36c05afdd72e9bfac64f393c8204871"
# Code4 wrapper, conventions only. versionCode stays with Release Engineer.
CODE4_SHA = "a47a486e784dbf1868c0cd7c9b66691815db93aaf3fb4bf998405f78defba3e0"
# Center 72dp of the 108dp adaptive icon is the viewport the platform says stays visible.
ADAPTIVE_SAFE = 72 / 108
SAFE_MARGIN = 0.92

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
# Splash pixel sizes in the code4 (and code3) wrapper. Identical across those archives.
SPLASH = {
    "drawable/splash.png": (480, 320),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
}
RES = ROOT / "android-icons" / "res"
PNG_SIG = b"\x89PNG\r\n\x1a\n"
KEEP_CHUNKS = {b"IHDR", b"PLTE", b"tRNS", b"IDAT", b"IEND"}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def strip_png(data):
    assert data.startswith(PNG_SIG)
    out = bytearray(PNG_SIG)
    i = 8
    while i + 8 <= len(data):
        ln = int.from_bytes(data[i:i + 4], "big")
        typ = data[i + 4:i + 8]
        chunk = data[i:i + 12 + ln]
        i += 12 + ln
        if typ in KEEP_CHUNKS:
            out += chunk
        if typ == b"IEND":
            break
    return bytes(out)


def save_png(im, path):
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(strip_png(buf.getvalue()))


def load_master():
    path = ROOT / MASTER_REL
    data = path.read_bytes()
    digest = sha256(data)
    if digest != MASTER_SHA:
        raise SystemExit(f"master hash {digest} != {MASTER_SHA}")
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    if im.size != (1024, 1024):
        raise SystemExit(f"master size {im.size}, expected 1024x1024")
    return im, data


def corner_bg(im):
    return im.getpixel((0, 0))


def content_bbox(im, bg, tol=18):
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if max(abs(c[i] - bg[i]) for i in range(3)) > tol:
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    return minx, miny, maxx, maxy


def is_yellow(c, bg, tol=18):
    if max(abs(c[i] - bg[i]) for i in range(3)) <= tol:
        return False
    r, g, b = c[:3]
    return r > 180 and g > 140 and b < 90


def yellow_sides(im, bg):
    px = im.load()
    w, h = im.size
    left = right = 0
    for y in range(h):
        for x in range(w):
            if is_yellow(px[x, y], bg):
                if x < w / 2:
                    left += 1
                else:
                    right += 1
    return left, right


def contain(master, w, h, bg):
    canvas = Image.new("RGBA", (w, h), bg)
    scale = min(w / master.width, h / master.height)
    nw, nh = max(1, round(master.width * scale)), max(1, round(master.height * scale))
    resized = master.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    return canvas


def content_radius(im, bg, tol=18):
    px = im.load()
    cx, cy = (im.width - 1) / 2, (im.height - 1) / 2
    radius = 0
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if max(abs(c[i] - bg[i]) for i in range(3)) <= tol:
                continue
            radius = max(radius, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5)
    return radius


def foreground(master, size, bg, bbox):
    # Scale from the master's center so every non-cream pixel, including both
    # rays, lands inside the circle the splash and adaptive masks actually show.
    del bbox
    safe_r = size * ADAPTIVE_SAFE / 2 * SAFE_MARGIN
    scale = safe_r / content_radius(master, bg)
    nw = max(1, round(master.width * scale))
    nh = max(1, round(master.height * scale))
    resized = master.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def circle_mask(im):
    out = im.copy()
    px = out.load()
    w, h = out.size
    cx, cy = (w - 1) / 2, (h - 1) / 2
    radius = min(w, h) / 2
    for y in range(h):
        for x in range(w):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d >= radius:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
            elif d > radius - 1:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, int(a * (radius - d)))
    return out


def yellow_inside_safe_circle(im, bg):
    px = im.load()
    w, h = im.size
    cx, cy = (w - 1) / 2, (h - 1) / 2
    radius = w * ADAPTIVE_SAFE / 2
    outside = 0
    for y in range(h):
        for x in range(w):
            if not is_yellow(px[x, y], bg):
                continue
            if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 > radius + 0.5:
                outside += 1
    return outside == 0


def mask_preview(im, kind):
    """Show the artwork under a circle or squircle. Outside the mask is dimmed, not deleted."""
    out = im.convert("RGBA")
    px = out.load()
    w, h = out.size
    cx, cy = (w - 1) / 2, (h - 1) / 2
    limit = w * ADAPTIVE_SAFE / 2
    for y in range(w):
        for x in range(h):
            dx, dy = (x - cx) / limit, (y - cy) / limit
            if kind == "circle":
                inside = dx * dx + dy * dy <= 1
            else:
                inside = abs(dx) ** 4 + abs(dy) ** 4 <= 1
            if not inside:
                r, g, b, a = px[x, y]
                px[x, y] = (int(r * 0.45 + 180), int(g * 0.45 + 180), int(b * 0.45 + 170), a)
    return out


def build():
    master, master_bytes = load_master()
    bg = corner_bg(master)
    bbox = content_bbox(master, bg)
    left, right = yellow_sides(master, bg)
    if left < 100 or right < 100:
        raise SystemExit(f"master is missing one yellow mark ({left}, {right})")
    files = {}

    def put(rel, im):
        path = ROOT / rel
        save_png(im, path)
        data = path.read_bytes()
        files[rel] = {"bytes": len(data), "sha256": sha256(data)}

    for name, size in (("icons/favicon-32.png", 32), ("icons/favicon-48.png", 48), ("icons/apple-touch-180.png", 180)):
        put(name, contain(master, size, size, bg))
    report = {"favicon32_yellow_sides": list(yellow_sides(Image.open(ROOT / "icons/favicon-32.png").convert("RGBA"), bg)),
              "favicon48_yellow_sides": list(yellow_sides(Image.open(ROOT / "icons/favicon-48.png").convert("RGBA"), bg))}
    for label, sides in report.items():
        if sides[0] < 1 or sides[1] < 1:
            raise SystemExit(f"{label} lost a yellow mark: {sides}")

    fg_ok = True
    for density, scale in DENSITIES.items():
        legacy = int(48 * scale)
        fore = int(108 * scale)
        square = contain(master, legacy, legacy, bg)
        put(f"android-icons/res/mipmap-{density}/ic_launcher.png", square)
        put(f"android-icons/res/mipmap-{density}/ic_launcher_round.png", circle_mask(square))
        fg = foreground(master, fore, bg, bbox)
        if not yellow_inside_safe_circle(fg, bg):
            fg_ok = False
        put(f"android-icons/res/mipmap-{density}/ic_launcher_foreground.png", fg)
    if not fg_ok:
        raise SystemExit("yellow marks fall outside the adaptive safe circle")
    # API 31 splash icon slot is 288dp with a 192dp visible circle (192/288 = 72/108).
    splash_icon = foreground(master, 432, bg, bbox)
    if not yellow_inside_safe_circle(splash_icon, bg):
        raise SystemExit("splash icon yellow marks fall outside the system splash circle")
    put("android-icons/res/drawable-nodpi/splash_icon.png", splash_icon)
    report["adaptive_yellow_inside_72dp_circle"] = True
    report["splash_icon"] = "drawable-nodpi/splash_icon.png uses the same safe circle as the adaptive foreground. Theme.SplashScreen on API 31 reads windowSplashScreenAnimatedIcon, not android:background."

    color = f"#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}"
    xml = ROOT / "android-icons/res/values/ic_launcher_background.xml"
    xml.parent.mkdir(parents=True, exist_ok=True)
    xml.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{color}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    data = xml.read_bytes()
    files["android-icons/res/values/ic_launcher_background.xml"] = {"bytes": len(data), "sha256": sha256(data)}
    report["background"] = color

    for rel, (w, h) in SPLASH.items():
        put(f"android-icons/res/{rel}", contain(master, w, h, bg).convert("RGB"))
    report["splash_note"] = "Full master contained and centered. No crop. No system-bar padding."
    report["master_sha256"] = MASTER_SHA
    report["master_bytes"] = len(master_bytes)
    report["code4_wrapper_sha256"] = CODE4_SHA
    report["content_bbox"] = list(bbox)
    report["outputs"] = files
    (ROOT / "android-icons" / "build-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def check():
    report = build()
    # build() already wrote the files. Compare a second pass kept in memory via re-read.
    # A second build must be byte-stable.
    first = {rel: meta["sha256"] for rel, meta in report["outputs"].items()}
    report2 = build()
    second = {rel: meta["sha256"] for rel, meta in report2["outputs"].items()}
    if first != second:
        raise SystemExit("generator is not byte-stable")
    print(f"ok {len(first)} exports bound to {MASTER_SHA}")
    return report2


def previews(dest):
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    bg_im = Image.open(ROOT / "android-icons/res/mipmap-xxxhdpi/ic_launcher_foreground.png").convert("RGBA")
    save_png(Image.open(ROOT / "icons/favicon-32.png").convert("RGBA").resize((128, 128), Image.Resampling.NEAREST), dest / "preview-32-nearest-4x.png")
    save_png(Image.open(ROOT / "icons/favicon-48.png").convert("RGBA").resize((192, 192), Image.Resampling.NEAREST), dest / "preview-48-nearest-4x.png")
    save_png(mask_preview(bg_im, "circle"), dest / "preview-adaptive-circle-mask.png")
    save_png(mask_preview(bg_im, "squircle"), dest / "preview-adaptive-squircle-mask.png")
    save_png(Image.open(ROOT / "android-icons/res/drawable-port-mdpi/splash.png").convert("RGBA"), dest / "preview-splash-port-mdpi.png")
    save_png(Image.open(ROOT / "android-icons/res/drawable-land-mdpi/splash.png").convert("RGBA"), dest / "preview-splash-land-mdpi.png")
    save_png(Image.open(ROOT / "android-icons/res/mipmap-xxxhdpi/ic_launcher_round.png").convert("RGBA"), dest / "preview-legacy-round-xxxhdpi.png")
    print(dest)


def main(argv):
    if "--check" in argv:
        check()
    else:
        build()
        print("wrote icon exports")
    if "--previews" in argv:
        previews(argv[argv.index("--previews") + 1])


if __name__ == "__main__":
    main(sys.argv[1:])
