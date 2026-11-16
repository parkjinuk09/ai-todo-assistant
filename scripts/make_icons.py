"""앱 아이콘 만들기: 검정 바탕 + 파란 체크 + 흰 반짝임.

    backend/.venv/bin/python scripts/make_icons.py

- frontend/public/icon-512.png, icon-192.png : 웹·PWA용 (가장자리까지 꽉 찬 정사각형, maskable 안전 영역 안에 그림)
- frontend/public/favicon.png               : 탭 아이콘 (둥근 사각형)
- mac/QuickTodo/AppIcon.png                 : 맥 앱용 (1024, 투명 여백 + 둥근 사각형 + 그림자)
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SS = 4  # 계단 현상을 없애려고 4배로 그린 뒤 줄인다

TOP, BOTTOM = (46, 46, 51), (17, 17, 19)
BLUE, WHITE = (10, 132, 255), (255, 255, 255)

# 412x412 기준 좌표 (디자인 시안 D)
CHECK = [(112, 222), (176, 286), (288, 172)]
CHECK_WIDTH = 42
SPARK_CENTER, SPARK_R = (322, 104), 38


def gradient(size):
    col = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        col.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return col.resize((size, size))


def spark_points(cx, cy, r, steps=24):
    """안쪽으로 휜 네 꼭지 별"""
    tips = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    pts = []
    for i in range(4):
        (x0, y0), (x1, y1) = tips[i], tips[(i + 1) % 4]
        # 중심 쪽으로 당긴 제어점 하나짜리 곡선
        qx, qy = cx + (x0 + x1 - 2 * cx) * 0.12, cy + (y0 + y1 - 2 * cy) * 0.12
        for s in range(steps):
            t = s / steps
            pts.append((
                (1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t**2 * x1,
                (1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t**2 * y1,
            ))
    return pts


def draw_glyph(img, ox, oy, box):
    """box 크기의 정사각형(왼쪽 위 ox, oy) 안에 체크와 반짝임을 그린다"""
    k = box / 412
    p = lambda x, y: (ox + x * k, oy + y * k)
    d = ImageDraw.Draw(img)
    w = CHECK_WIDTH * k
    pts = [p(*c) for c in CHECK]
    d.line(pts, fill=BLUE, width=round(w))
    for x, y in pts:  # 둥근 끝과 이음매
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=BLUE)
    cx, cy = p(*SPARK_CENTER)
    d.polygon(spark_points(cx, cy, SPARK_R * k), fill=WHITE)


def full_bleed(size):
    s = size * SS
    img = gradient(s).convert("RGBA")
    box = s * 0.8  # maskable 안전 영역
    draw_glyph(img, (s - box) / 2, (s - box) / 2, box)
    return img.resize((size, size), Image.LANCZOS)


def rounded(size, margin_ratio, shadow):
    s = size * SS
    m = round(s * margin_ratio)
    side = s - 2 * m
    radius = round(side * 0.2237)

    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, s - m - 1, s - m - 1), radius, fill=255)

    body = gradient(side).convert("RGBA")
    # 위쪽 가장자리의 옅은 빛
    hi = Image.new("L", (side, side), 0)
    hd = ImageDraw.Draw(hi)
    hd.rounded_rectangle((0, 0, side - 1, side - 1), radius, outline=255, width=max(2, side // 260))
    fade = Image.new("L", (1, side))
    for y in range(side):
        fade.putpixel((0, y), max(0, round(60 * (1 - y / (side * 0.35)))))
    hi = ImageChops.multiply(hi, fade.resize((side, side)))
    body = Image.composite(Image.new("RGBA", (side, side), WHITE + (255,)), body, hi)
    draw_glyph(body, 0, 0, side)

    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("L", (s, s), 0)
        off = round(s * 0.012)
        sh.paste(mask.point(lambda v: v * 0.42), (0, off))
        sh = sh.filter(ImageFilter.GaussianBlur(s * 0.014))
        out.putalpha(sh)
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    layer.paste(body, (m, m))
    out = Image.composite(layer, out, mask)
    return out.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    pub = ROOT / "frontend" / "public"
    full_bleed(512).save(pub / "icon-512.png")
    full_bleed(192).save(pub / "icon-192.png")
    rounded(64, 0.03, shadow=False).save(pub / "favicon.png")
    rounded(1024, 100 / 1024, shadow=True).save(ROOT / "mac" / "QuickTodo" / "AppIcon.png")
    print("아이콘 4개를 만들었습니다")
