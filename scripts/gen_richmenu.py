#!/usr/bin/env python3
# LINE リッチメニュー画像（2500x1686 / 6分割・白ベース・黒線アイコン）
import math
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686
S = 3  # スーパーサンプリング
JP = "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"

img = Image.new("RGB", (W * S, H * S), "white")
d = ImageDraw.Draw(img)

BLACK = (26, 26, 26)
GRAY = (120, 120, 120)
SEP = (226, 226, 226)


def dot(x, y, r, color=BLACK):
    d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=color)


def line(p1, p2, w, color=BLACK, caps=True):
    d.line([(p1[0] * S, p1[1] * S), (p2[0] * S, p2[1] * S)], fill=color, width=int(round(w * S)))
    if caps:
        r = w / 2
        for x, y in (p1, p2):
            dot(x, y, r, color)


def polyline(pts, w, color=BLACK, closed=False):
    pp = list(pts) + ([pts[0]] if closed else [])
    for i in range(len(pp) - 1):
        line(pp[i], pp[i + 1], w, color)


def arc(cx, cy, r, a0, a1, w, color=BLACK):
    steps = max(10, int(abs(a1 - a0) / 4))
    pts = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    polyline(pts, w, color)


def rrect(x0, y0, x1, y1, rad, w, color=BLACK):
    line((x0 + rad, y0), (x1 - rad, y0), w, color, caps=False)
    line((x1, y0 + rad), (x1, y1 - rad), w, color, caps=False)
    line((x1 - rad, y1), (x0 + rad, y1), w, color, caps=False)
    line((x0, y1 - rad), (x0, y0 + rad), w, color, caps=False)
    arc(x1 - rad, y0 + rad, rad, -90, 0, w, color)
    arc(x1 - rad, y1 - rad, rad, 0, 90, w, color)
    arc(x0 + rad, y1 - rad, rad, 90, 180, w, color)
    arc(x0 + rad, y0 + rad, rad, 180, 270, w, color)


_fonts = {}
def font(size):
    k = int(size * S)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(JP, k)
    return _fonts[k]


def text_ls(cx, cy, s, size, color=BLACK, ls=0, bold=False):
    f = font(size)
    sw = int(size * S * 0.045) if bold else 0
    adv = [f.getlength(ch) for ch in s]
    total = sum(adv) + ls * S * (len(s) - 1)
    x = cx * S - total / 2
    y = cy * S
    for ch, a in zip(s, adv):
        d.text((x, y), ch, font=f, fill=color, anchor="lm", stroke_width=sw, stroke_fill=color)
        x += a + ls * S


# ---- アイコン ----
IW = 6  # アイコン線幅


def ic_login(cx, cy):   # 出勤
    polyline([(cx + 28, cy - 92), (cx + 72, cy - 92), (cx + 72, cy + 92), (cx + 28, cy + 92)], IW)
    line((cx - 88, cy), (cx + 36, cy), IW)
    polyline([(cx + 6, cy - 30), (cx + 38, cy), (cx + 6, cy + 30)], IW)


def ic_logout(cx, cy):  # 退勤
    polyline([(cx - 28, cy - 92), (cx - 72, cy - 92), (cx - 72, cy + 92), (cx - 28, cy + 92)], IW)
    line((cx - 30, cy), (cx + 88, cy), IW)
    polyline([(cx + 58, cy - 30), (cx + 90, cy), (cx + 58, cy + 30)], IW)


def ic_calendar(cx, cy):  # シフト管理
    rrect(cx - 105, cy - 78, cx + 105, cy + 100, 16, IW)
    line((cx - 105, cy - 30), (cx + 105, cy - 30), IW, caps=False)
    line((cx - 58, cy - 104), (cx - 58, cy - 64), IW)
    line((cx + 58, cy - 104), (cx + 58, cy - 64), IW)
    for ry in (cy + 14, cy + 64):
        for rx in (cx - 56, cx, cx + 56):
            dot(rx, ry, 7)


def ic_unlock(cx, cy):  # 開錠（シャックルを持ち上げ＝開）
    rrect(cx - 80, cy - 2, cx + 80, cy + 112, 20, IW)
    line((cx - 46, cy - 2), (cx - 46, cy - 70), IW)
    arc(cx, cy - 70, 46, 180, 360, IW)
    line((cx + 46, cy - 70), (cx + 46, cy - 38), IW)  # 右脚が本体に届かない＝開
    dot(cx, cy + 44, 8)
    line((cx, cy + 50), (cx, cy + 82), IW)


def ic_lock(cx, cy):    # 施錠（シャックル閉）
    rrect(cx - 80, cy - 2, cx + 80, cy + 112, 20, IW)
    line((cx - 46, cy - 2), (cx - 46, cy - 56), IW)
    arc(cx, cy - 56, 46, 180, 360, IW)
    line((cx + 46, cy - 56), (cx + 46, cy - 2), IW)
    dot(cx, cy + 44, 8)
    line((cx, cy + 50), (cx, cy + 82), IW)


def zn_logo(cx, cy):    # ZN モノグラム（再現）＋ ZENRYOKU STRETCH
    mw = 5
    my = cy - 28
    # Z
    polyline([(cx - 92, my - 50), (cx - 8, my - 50), (cx - 92, my + 50), (cx - 8, my + 50)], mw)
    # N
    polyline([(cx + 12, my + 50), (cx + 12, my - 50), (cx + 92, my + 50), (cx + 92, my - 50)], mw)
    text_ls(cx, cy + 70, "ZENRYOKU STRETCH", 26, BLACK, ls=4)


# ---- レイアウト ----
cols = [W / 6, W / 2, 5 * W / 6]
rows_top = [0, H / 2]

cells = [
    ("出勤", "CLOCK IN", ic_login),
    ("退勤", "CLOCK OUT", ic_logout),
    ("シフト管理", "SHIFT", ic_calendar),
    ("開錠", "UNLOCK", ic_unlock),
    ("施錠", "LOCK", ic_lock),
    (None, None, None),  # F = ロゴ
]

for idx, (jp, en, icon) in enumerate(cells):
    r, c = divmod(idx, 3)
    cx = cols[c]
    top = rows_top[r]
    if icon is None:
        zn_logo(cx, top + 421)
        continue
    text_ls(cx, top + 138, jp, 42, BLACK, ls=12)
    icon(cx, top + 398)
    text_ls(cx, top + 640, en, 58, BLACK, ls=6, bold=True)

# ---- 区切り線 ----
m = 46
for x in (W / 3, 2 * W / 3):
    line((x, m), (x, H - m), 2, SEP, caps=False)
line((m, H / 2), (W - m, H / 2), 2, SEP, caps=False)

out = Image.new("RGB", (W, H), "white")
out.paste(img.resize((W, H), Image.LANCZOS))
out.save("richmenu_menu.png", "PNG")
print("saved richmenu_menu.png", out.size)
