"""ヤマシギ スプライトシート生成(右向き / 1コマ 72x48px)

承認済みの立ち姿(woodcock_idle.png)と同じ部品・同じ色で、
部品の位置だけを動かして各コマを作る。
  行0: idle(待機)2コマ / 行1: walk(歩き)6コマ / 行2: peck(つつく)4コマ
左向きは、アプリ側で左右反転して使う。
"""
import json
import math
import os

from PIL import Image, ImageDraw

W, H = 72, 48
COLS = 8
OUT = "sprites"

# ---------------- パレット(立ち姿と同じ:彩度を28%下げた色) ----------------
C0 = {
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
DESAT = 0.28


def desaturate(c, amount=DESAT):
    r, g, b, a = c
    gray = 0.299 * r + 0.587 * g + 0.114 * b
    return (round(r + (gray - r) * amount),
            round(g + (gray - g) * amount),
            round(b + (gray - b) * amount), a)


C = {k: (v if k == "white" else desaturate(v)) for k, v in C0.items()}


def h(x, y, s=0):
    """決まった乱数もどき(毎回同じ絵になる)"""
    return ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) & 0xFF


# ---------------- 形の部品(ローカル座標) ----------------
def ellipse_mask(cx, cy, rx, ry):
    return {(x, y) for y in range(H) for x in range(W)
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0}


def poly_mask(poly):
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon(poly, fill=255)
    px = im.load()
    return {(x, y) for y in range(H) for x in range(W) if px[x, y]}


def shift(mask, dx, dy):
    return {(x + dx, y + dy) for (x, y) in mask}


TAIL = poly_mask([(15, 24), (6, 33), (8, 37), (19, 32)])
BODY = ellipse_mask(29, 27, 17, 11)
WING = poly_mask([(13, 24), (22, 19), (36, 20), (40, 27), (33, 33), (20, 33)])
HEAD = ellipse_mask(45, 17, 7, 7)
BILL_DEFAULT = poly_mask([(51, 15), (69, 24), (69, 25), (51, 20)])

BILL_BASE = (51.0, 17.5)      # くちばしの付け根(中心)
BILL_TIP_DEFAULT = (69.0, 24.5)
BILL_TIP_DOWN = (60.0, 35.0)  # 地面をつついたときの先端(頭の座標系)


# ---------------- 色の決め方 ----------------
def tail_color(x, y):
    return C["buff"] if h(x, y, 1) % 5 == 0 else (C["rufous"] if (x + y) % 4 < 2 else C["mid"])


def body_color(x, y):
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
    if (y % 3) == 0:
        return C["rufous"] if r % 2 else C["mid"]
    return C["belly"] if r % 6 else C["light"]


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


def head_color(x, y):
    r = h(x, y, 4)
    if x <= 43 and y <= 15:
        if (x - 38) % 3 == 0:
            return C["black"]
        return C["dark"] if r % 3 else C["mid"]
    if y >= 19:
        return C["light"] if r % 6 else C["buff"]
    return C["buff"] if r % 5 else C["light"]


def neck_color(x, y):
    return C["buff"] if h(x, y, 5) % 4 else C["rufous"]


def bill_default_color(x, y):
    return C["billtip"] if x >= 64 else (C["bill"] if (x + y) % 5 else C["rufous"])


# ---------------- 1コマを描く ----------------
def draw_leg(L, lx, fdx, lift):
    """脚1本。fdx=足先の横ずれ、lift=足を持ち上げる量"""
    yf = 43 - lift
    for y in range(36, yf + 1):
        t = (y - 36) / (yf - 36) if yf > 36 else 0
        x = lx + round(fdx * t)
        L[(x, y)] = C["leg"]
        L[(x + 1, y)] = C["legdk"] if y > 40 else C["leg"]
    xf = lx + fdx
    for dx in range(-2, 4):
        L[(xf + dx, yf + 1)] = C["legdk"]
    L[(xf + 3, yf)] = C["legdk"]


def bill_rotated(t):
    """くちばしを付け根を軸に下へ傾ける(t=0:通常 / t=1:真下向き)"""
    tx = BILL_TIP_DEFAULT[0] + (BILL_TIP_DOWN[0] - BILL_TIP_DEFAULT[0]) * t
    ty = BILL_TIP_DEFAULT[1] + (BILL_TIP_DOWN[1] - BILL_TIP_DEFAULT[1]) * t
    bx, by = BILL_BASE
    dx, dy = tx - bx, ty - by
    n = math.hypot(dx, dy)
    ux, uy = dy / n, -dx / n  # くちばしの背側へ向かう向き
    poly = [
        (bx + ux * 2.2, by + uy * 2.2),
        (tx + ux * 0.5, ty + uy * 0.5),
        (tx - ux * 0.5, ty - uy * 0.5),
        (bx - ux * 2.2, by - uy * 2.2),
    ]
    L2 = dx * dx + dy * dy

    def color(x, y):
        s = ((x - bx) * dx + (y - by) * dy) / L2
        return C["billtip"] if s > 0.78 else (C["bill"] if (x + y) % 5 else C["rufous"])

    return poly_mask(poly), color


def render(bdx=0, bdy=0, hdx=0, hdy=0, tdy=0, legs=((0, 0), (0, 0)), bill_t=0.0):
    """bdx/bdy=胴体のずれ、hdx/hdy=頭のずれ、tdy=尾の上下、legs=脚2本、bill_t=くちばしの傾き"""
    L = {}

    def paint(mask, fn, ox, oy):
        for (x, y) in mask:
            L[(x + ox, y + oy)] = fn(x, y)

    def put(pts, c, ox, oy):
        for (x, y) in pts:
            L[(x + ox, y + oy)] = c

    # 尾
    paint(TAIL, tail_color, bdx, bdy + tdy)
    put([(7, 35), (8, 36), (9, 35), (8, 34)], C["light"], bdx, bdy + tdy)
    # 脚(胴体の下に描く)
    for lx, (fdx, lift) in zip((29, 36), legs):
        draw_leg(L, lx, fdx, lift)
    # 胴体・背中の筋・翼
    paint(BODY, body_color, bdx, bdy)
    for (x0, y0, x1, y1) in [(14, 20, 24, 17), (18, 23, 30, 18), (24, 24, 36, 19)]:
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i // n
            y = y0 + (y1 - y0) * i // n
            if (x, y) in BODY:
                L[(x + bdx, y + bdy)] = C["buff"]
    paint(WING, wing_color, bdx, bdy)
    # 頭
    paint(HEAD, head_color, hdx, hdy)
    # 首(胴体と頭をつなぐ)
    ax, ay = 40 + bdx, 22 + bdy
    bx, by = 40 + hdx, 22 + hdy
    n = max(abs(bx - ax), abs(by - ay), 1)
    neck = set()
    for i in range(n + 1):
        neck |= ellipse_mask(round(ax + (bx - ax) * i / n), round(ay + (by - ay) * i / n), 5, 5)
    neck -= shift(BODY, bdx, bdy)
    for (x, y) in neck:
        L[(x, y)] = neck_color(x - bdx, y - bdy)
    # 頬の斑・くちばしから目への線
    put([(42, 19), (43, 19), (42, 20), (43, 20)], C["dark"], hdx, hdy)
    put([(48, 17), (47, 16), (46, 16), (45, 15)], C["black"], hdx, hdy)
    # くちばし
    if bill_t <= 0:
        paint(BILL_DEFAULT, bill_default_color, hdx, hdy)
    else:
        mask, color = bill_rotated(bill_t)
        paint(mask, color, hdx, hdy)
    # 目
    put([(43, 14), (44, 14), (45, 14), (43, 15), (44, 15), (45, 15), (43, 16), (44, 16), (45, 16)],
        C["black"], hdx, hdy)
    put([(42, 13), (43, 13), (44, 13), (45, 13), (46, 13), (42, 14), (46, 14), (42, 15), (46, 15),
         (42, 16), (46, 16), (43, 17), (44, 17), (45, 17)], C["light"], hdx, hdy)
    put([(44, 14)], C["white"], hdx, hdy)

    # 輪郭
    sil = set(L.keys())
    for (x, y) in sil:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in sil and 0 <= q[0] < W and 0 <= q[1] < H:
                L[q] = C["outline"]

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()
    for (x, y), c in L.items():
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = c
    return img


# ---------------- ポーズ(各コマの設定) ----------------
IDLE = [
    dict(),                       # 承認済みの立ち姿そのまま
    dict(hdy=1, tdy=1),           # 頭を1px下げる(呼吸)
]

# 歩き(参考動画をもとにしたヤマシギらしい歩き方・8コマ=2歩ぶん)
#  - くちばしは常に斜め下(約38度)に構える
#  - 脚を開いた「背伸び」の瞬間は、体が持ち上がって頭が上がり、尾が下がる
#  - 脚をそろえる瞬間は、体がすっと沈み、尾が上がる(体全体をゆらすように歩く)
#  - 足先は地面すれすれを細かく運ぶ
STEP = [(3, 0), (1, 0), (-1, 0), (-3, 0), (-2, 2), (0, 3), (2, 2), (3, 1)]
WALK_BDX = [0, 0, -1, 0, 0, 0, -1, 0]
WALK_BDY = [-1, 0, 1, 0, -1, 0, 1, 0]     # 体の上下
WALK_HDX = [1, 0, -1, 0, 1, 0, -1, 0]     # 頭の前後
WALK_HDY = [-2, -1, 1, 0, -2, -1, 1, 0]   # 頭の上下(背伸びで上がる)
WALK_TDY = [1, 0, -1, 0, 1, 0, -1, 0]     # 尾の上下(背伸びで下がる)
WALK_BILL = 0.4                           # くちばしの傾き(0.4で約38度)
WALK = [
    dict(bdx=WALK_BDX[i], bdy=WALK_BDY[i], hdx=WALK_HDX[i], hdy=WALK_HDY[i],
         tdy=WALK_TDY[i], bill_t=WALK_BILL,
         legs=(STEP[(i + 4) % 8], STEP[i]))   # (後ろ足, 前足)
    for i in range(8)
]

PECK = [
    dict(hdx=2, hdy=3, bill_t=0.35),                              # 構える
    dict(bdx=1, bdy=1, hdx=4, hdy=9, tdy=-1, bill_t=1.0),         # 地面へ
    dict(bdx=1, bdy=1, hdx=5, hdy=9, tdy=-1, bill_t=1.0),         # つつく
    dict(hdx=2, hdy=3, bill_t=0.35),                              # 戻る
]

ANIMS = [("idle", IDLE, 2), ("walk", WALK, 8), ("peck", PECK, 7)]


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = len(ANIMS)
    sheet = Image.new("RGBA", (W * COLS, H * rows), (0, 0, 0, 0))
    frames = {}
    meta = {"frameWidth": W, "frameHeight": H, "columns": COLS, "facing": "right",
            "groundY": 44, "animations": {}}
    for r, (name, poses, fps) in enumerate(ANIMS):
        frames[name] = []
        for i, p in enumerate(poses):
            im = render(**p)
            frames[name].append(im)
            sheet.alpha_composite(im, (i * W, r * H))
        meta["animations"][name] = {"row": r, "frames": len(poses), "fps": fps}

    # 立ち姿が承認済みの絵と一致しているか確認
    ref_path = "woodcock_idle.png"
    if os.path.exists(ref_path):
        same = Image.open(ref_path).convert("RGBA").tobytes() == frames["idle"][0].tobytes()
        print("承認済みの立ち姿と一致:", same)

    sheet.save(f"{OUT}/woodcock_sheet.png")
    with open(f"{OUT}/woodcock_sheet.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 確認用: シート拡大(3倍)
    S = 3
    prev = Image.new("RGBA", (W * COLS * S, H * rows * S), (198, 204, 212, 255))
    d = ImageDraw.Draw(prev)
    for r in range(rows):
        for c in range(COLS):
            d.rectangle([c * W * S, r * H * S, (c + 1) * W * S - 1, (r + 1) * H * S - 1],
                        outline=(160, 166, 176, 255))
    prev.alpha_composite(sheet.resize((W * COLS * S, H * rows * S), Image.NEAREST))
    prev.save(f"{OUT}/woodcock_sheet_x3.png")

    # 確認用: アニメーションGIF(5倍)
    S = 5
    for name, _, fps in ANIMS:
        seq = frames[name]
        if name == "peck":
            seq = seq + [seq[2], seq[1]]  # 地面を2回つつく
        gifs = []
        for im in seq:
            bg = Image.new("RGBA", (W * S, (H + 4) * S), (198, 204, 212, 255))
            ImageDraw.Draw(bg).rectangle([0, (H - 3) * S, W * S, (H + 4) * S], fill=(32, 36, 44, 255))
            bg.alpha_composite(im.resize((W * S, H * S), Image.NEAREST), (0, 0))
            gifs.append(bg.convert("RGB"))
        gifs[0].save(f"{OUT}/preview_{name}.gif", save_all=True, append_images=gifs[1:],
                     duration=int(1000 / fps), loop=0)
    print("done")


if __name__ == "__main__":
    main()
