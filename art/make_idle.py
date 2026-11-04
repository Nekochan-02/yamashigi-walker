"""ヤマシギ ドット絵見本(立ち姿・右向き) 64x48px"""
from PIL import Image, ImageDraw

W, H = 72, 48

# パレット
C = {
    "outline": (43, 29, 20, 255),
    "black":   (28, 20, 16, 255),
    "dark":    (74, 50, 34, 255),
    "mid":     (122, 84, 52, 255),
    "rufous":  (162, 104, 58, 255),
    "buff":    (217, 184, 120, 255),
    "light":   (236, 217, 164, 255),
    "belly":   (200, 166, 106, 255),
    "leg":     (201, 143, 122, 255),
    "legdk":   (150, 100, 86, 255),
    "bill":    (190, 142, 112, 255),
    "billtip": (90, 64, 48, 255),
    "white":   (255, 255, 255, 255),
}


# --- 色を灰色寄りに調整(彩度を下げる) ---
DESAT = 0.28  # 0=変更なし、1=完全なモノクロ


def desaturate(c, amount=DESAT):
    r, g, b, a = c
    gray = 0.299 * r + 0.587 * g + 0.114 * b
    return (round(r + (gray - r) * amount),
            round(g + (gray - g) * amount),
            round(b + (gray - b) * amount), a)


C = {k: (v if k == "white" else desaturate(v)) for k, v in C.items()}


def h(x, y, s=0):
    """決まった乱数もどき(毎回同じ絵になる)"""
    return ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) & 0xFF


def ellipse_mask(cx, cy, rx, ry):
    pts = set()
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                pts.add((x, y))
    return pts


def poly_mask(poly):
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon(poly, fill=255)
    px = im.load()
    return {(x, y) for y in range(H) for x in range(W) if px[x, y]}


layers = {}  # (x,y) -> color  (後から描いたものが上書き)


def paint(mask, fn):
    for (x, y) in mask:
        c = fn(x, y)
        if c is not None:
            layers[(x, y)] = c


# --- 尾(短く、先がうすい色) ---
tail = poly_mask([(15, 24), (6, 33), (8, 37), (19, 32)])
paint(tail, lambda x, y: C["buff"] if h(x, y, 1) % 5 == 0 else (C["rufous"] if (x + y) % 4 < 2 else C["mid"]))
for p in [(7, 35), (8, 36), (9, 35), (8, 34)]:
    layers[p] = C["light"]

# --- 脚(短い、ピンク灰色) ---
for lx in (29, 36):
    for y in range(37, 44):
        layers[(lx, y)] = C["leg"]
        layers[(lx + 1, y)] = C["legdk"] if y > 40 else C["leg"]
    for dx in (-2, -1, 0, 1, 2, 3):
        layers[(lx + dx, 44)] = C["legdk"]
    layers[(lx + 3, 43)] = C["legdk"]

# --- 胴体 ---
body = ellipse_mask(29, 27, 17, 11)


def body_color(x, y):
    # 背中側(上)は濃い茶、腹側(下)は黄褐色に横しま
    t = (y - 16) / 22.0
    r = h(x, y, 2)
    if t < 0.38:
        if r % 9 == 0:
            return C["black"]
        if r % 7 == 0:
            return C["rufous"]
        return C["dark"] if (x // 3 + y // 2) % 3 else C["mid"]
    if t < 0.62:
        if (y % 3) == 0:
            return C["mid"] if r % 3 else C["rufous"]
        return C["rufous"] if r % 4 == 0 else C["buff"]
    # 腹
    if (y % 3) == 0:
        return C["rufous"] if r % 2 else C["mid"]
    return C["belly"] if r % 6 else C["light"]


paint(body, body_color)

# --- 背中の淡い縦すじ(ヤマシギの特徴) ---
for (x0, y0, x1, y1) in [(14, 20, 24, 17), (18, 23, 30, 18), (24, 24, 36, 19)]:
    n = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i // n
        y = y0 + (y1 - y0) * i // n
        if (x, y) in body:
            layers[(x, y)] = C["buff"]

# --- 翼(たたんだ羽。羽の縁が淡い) ---
wing = poly_mask([(13, 24), (22, 19), (36, 20), (40, 27), (33, 33), (20, 33)])


def wing_color(x, y):
    r = h(x, y, 3)
    band = (x + (y * 2)) % 7
    if band == 0:
        return C["light"]
    if band == 1:
        return C["buff"]
    if r % 8 == 0:
        return C["black"]
    if r % 5 == 0:
        return C["rufous"]
    return C["mid"] if (y // 2) % 2 else C["dark"]


paint(wing, wing_color)

# --- 頭 ---
head = ellipse_mask(45, 17, 7, 7)


def head_color(x, y):
    r = h(x, y, 4)
    # 後頭部(左側)の黒い横帯
    if x <= 43 and y <= 15:
        if (x - 38) % 3 == 0:
            return C["black"]
        return C["dark"] if r % 3 else C["mid"]
    if y >= 19:
        return C["light"] if r % 6 else C["buff"]
    return C["buff"] if r % 5 else C["light"]


paint(head, head_color)
# 首のつなぎ
paint(ellipse_mask(40, 22, 5, 5) - body, lambda x, y: C["buff"] if h(x, y, 5) % 4 else C["rufous"])

# 頬の黒い斑
for p in [(42, 19), (43, 19), (42, 20), (43, 20)]:
    layers[p] = C["dark"]
# 嘴の付け根から目へ向かう黒線
for p in [(48, 17), (47, 16), (46, 16), (45, 15)]:
    layers[p] = C["black"]

# --- くちばし(長くてまっすぐ、やや下向き) ---
bill = poly_mask([(51, 15), (69, 24), (69, 25), (51, 20)])
paint(bill, lambda x, y: C["billtip"] if x >= 64 else (C["bill"] if (x + y) % 5 else C["rufous"]))

# --- 目(大きく、頭の高い位置、やや後ろ) ---
for p in [(43, 14), (44, 14), (45, 14), (43, 15), (44, 15), (45, 15), (43, 16), (44, 16), (45, 16)]:
    layers[p] = C["black"]
for p in [(42, 13), (43, 13), (44, 13), (45, 13), (46, 13), (42, 14), (46, 14), (42, 15), (46, 15), (42, 16), (46, 16), (43, 17), (44, 17), (45, 17)]:
    if p not in [(46, 15)]:
        layers[p] = C["light"]
layers[(46, 15)] = C["light"]
layers[(44, 14)] = C["white"]

# --- 輪郭(シルエットの外側1px) ---
sil = set(layers.keys())
outline = set()
for (x, y) in sil:
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        q = (x + dx, y + dy)
        if q not in sil and 0 <= q[0] < W and 0 <= q[1] < H:
            outline.add(q)
for q in outline:
    layers[q] = C["outline"]

# --- 書き出し ---
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
px = img.load()
for (x, y), c in layers.items():
    px[x, y] = c
img.save("woodcock_idle.png")

# 確認用の拡大版(8倍・背景つき)
S = 8
prev = Image.new("RGBA", (W * S, H * S + 4 * S), (198, 204, 212, 255))
d = ImageDraw.Draw(prev)
d.rectangle([0, H * S - 2 * S + 4 * S, W * S, H * S + 4 * S], fill=(32, 36, 44, 255))  # タスクバー風
big = img.resize((W * S, H * S), Image.NEAREST)
prev.alpha_composite(big, (0, 2 * S))
prev.save("woodcock_idle_x8.png")
print("done", len(layers))
