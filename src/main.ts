// ヤマシギ・タスクバーウォーカー: 画面表示と、Tauri(Windowsの窓)との橋渡し
//
// ウィンドウは「作業領域の幅いっぱい × ヤマシギの高さ」の細長い透明な窓にして、
// タスクバーの真上に置く。マウス操作は素通り(クリックスルー)させ、
// ヤマシギはその中を canvas に描かれて左右に歩く。

import "./style.css";
import { Actor, type Pose, type SheetMeta } from "./actor";
import { Brain } from "./brain";
import { computeMetrics, readWorkArea, type Metrics } from "./layout";
import { SCALES, SPEEDS, loadSettings, saveSettings } from "./settings";
import sheetUrl from "./assets/woodcock_sheet.png";
import sheetJson from "./assets/woodcock_sheet.json";

const meta = sheetJson as SheetMeta;
const isTauri = "__TAURI_INTERNALS__" in window;

const STEP_SPRITE_PX = 10; // 1歩で進む距離(ドット絵のドット数)
const FEET_ROW = meta.groundY + 2; // 絵の中で足元(輪郭の下端)にあたる行

// 子ヤマシギの設定
const CHILD_SCALE_RATIO = 0.6; // 子ヤマシギの大きさ(親に対する比率)
const CHILD_GAP_SPRITE_PX = 4; // 親と子のあいだの隙間(ドット絵基準のドット数)
// 子ヤマシギが後ろにいるため親の後方に必要なスペース(ドット数)
const REAR_SPACE_SPRITE_PX = meta.frameWidth * CHILD_SCALE_RATIO + CHILD_GAP_SPRITE_PX;

// 画面外への散歩設定
const OFFSCREEN_CHANCE = 0.35; // 端に着いたときに画面外へ行く確率(35%)
const OFFSCREEN_MARGIN_SPRITE_PX = 16; // 完全に画面外へ消えたあと進む余白(ドット数)

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

let settings = loadSettings();
let metrics: Metrics = computeMetrics(settings.scale, window.devicePixelRatio || 1);
let worldWidth = window.innerWidth; // 歩ける幅(画面上の長さ)
let paused = false;
let layoutKey = "";

type TripState = "inside" | "exiting" | "returning";
let tripState: TripState = "inside";
let tripDir: 1 | -1 = 1;
let evaluatedEdge = false;

function getDynamicBounds(): { minX: number; maxX: number } {
  const drawScale = metrics.drawScale;
  const parentW = meta.frameWidth * drawScale;
  const childW = meta.frameWidth * (drawScale * CHILD_SCALE_RATIO);
  const childGap = CHILD_GAP_SPRITE_PX * drawScale;
  const offscreenExtra = OFFSCREEN_MARGIN_SPRITE_PX * drawScale;

  // 通常の画面内境界(親も子も画面内に収まる範囲)
  const rearSpace = childW + childGap;
  const onScreenMinX = rearSpace;
  const onScreenMaxX = Math.max(onScreenMinX, worldWidth - parentW - rearSpace);

  // 画面外境界(親も子も完全に画面外に隠れる範囲)
  const offScreenMinX = -(parentW + childGap + childW + offscreenExtra);
  const offScreenMaxX = worldWidth + childGap + childW + offscreenExtra;

  const currentX = typeof actor !== "undefined" ? actor.x : onScreenMinX;
  const currentDir = typeof actor !== "undefined" ? actor.dir : 1;

  // 画面中央付近にいるときは端判定フラグをリセット
  const safeMargin = 40 * drawScale;
  if (currentX > onScreenMinX + safeMargin && currentX < onScreenMaxX - safeMargin) {
    evaluatedEdge = false;
  }

  // 状態ごとの境界決定
  if (tripState === "inside") {
    // 右端に近づいているとき(Brainの2歩先判定より前に判定する)
    if (currentDir === 1 && currentX >= onScreenMaxX - 25 * drawScale) {
      if (!evaluatedEdge) {
        evaluatedEdge = true;
        if (Math.random() < OFFSCREEN_CHANCE) {
          tripState = "exiting";
          tripDir = 1;
        }
      }
    }
    // 左端に近づいているとき
    else if (currentDir === -1 && currentX <= onScreenMinX + 25 * drawScale) {
      if (!evaluatedEdge) {
        evaluatedEdge = true;
        if (Math.random() < OFFSCREEN_CHANCE) {
          tripState = "exiting";
          tripDir = -1;
        }
      }
    }
  }

  if (tripState === "exiting") {
    if (tripDir === 1) {
      if (currentDir === -1) {
        tripState = "returning";
      }
      return { minX: onScreenMinX, maxX: offScreenMaxX };
    } else {
      if (currentDir === 1) {
        tripState = "returning";
      }
      return { minX: offScreenMinX, maxX: onScreenMaxX };
    }
  }

  if (tripState === "returning") {
    if (tripDir === 1) {
      if (currentX <= onScreenMaxX) {
        tripState = "inside";
        return { minX: onScreenMinX, maxX: onScreenMaxX };
      }
      return { minX: onScreenMinX, maxX: offScreenMaxX };
    } else {
      if (currentX >= onScreenMinX) {
        tripState = "inside";
        return { minX: onScreenMinX, maxX: onScreenMaxX };
      }
      return { minX: offScreenMinX, maxX: onScreenMaxX };
    }
  }

  return { minX: onScreenMinX, maxX: onScreenMaxX };
}

const actor: Actor = new Actor(
  meta,
  new Brain(),
  {
    getStepPx: () => STEP_SPRITE_PX * metrics.drawScale,
    getBounds: getDynamicBounds,
  },
  REAR_SPACE_SPRITE_PX * metrics.drawScale,
);

// ---- Tauri(窓の操作)。ブラウザで開発するときは使わない ----
type TauriWindow = import("@tauri-apps/api/window").Window;
let win: TauriWindow | null = null;

async function setupTauri(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { listen } = await import("@tauri-apps/api/event");
  win = getCurrentWindow();
  await win.setIgnoreCursorEvents(true); // マウス操作を素通りさせる
  await win.setAlwaysOnTop(true);
  await listen<string>("tray-command", (e) => handleCommand(e.payload));
}

/** 窓の大きさと位置を、タスクバーの真上に合わせる。変化があったときだけ反映する */
async function applyLayout(force = false): Promise<void> {
  const area = readWorkArea(isTauri);
  metrics = computeMetrics(settings.scale, window.devicePixelRatio || 1);
  const { dpr, deviceScale, drawScale } = metrics;

  const cssW = Math.max(1, Math.floor(area.width));
  const cssH = (meta.frameHeight * deviceScale) / dpr;
  // 絵の足元が、作業領域の下端(=タスクバーの上端)にそろうように置く
  const top = area.top + area.height - FEET_ROW * drawScale;

  const key = [cssW, cssH, area.left, top, dpr, deviceScale].join("|");
  if (!force && key === layoutKey) return;
  layoutKey = key;
  worldWidth = cssW;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = meta.frameHeight * deviceScale;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.imageSmoothingEnabled = false;
  lastDrawKey = "";

  if (win) {
    const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
    await win.setSize(new LogicalSize(cssW, cssH));
    await win.setPosition(new LogicalPosition(area.left, top));
  }
}

// ---- 描画 ----
const sheet = new Image();
let lastDrawKey = "";

function drawSprite(
  frameX: number,
  frameY: number,
  dx: number,
  dy: number,
  w: number,
  h: number,
  dir: number,
): void {
  ctx.save();
  if (dir === 1) {
    ctx.drawImage(sheet, frameX, frameY, meta.frameWidth, meta.frameHeight, dx, dy, w, h);
  } else {
    // 左向きは、右向きの絵を左右反転して描く
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, frameX, frameY, meta.frameWidth, meta.frameHeight, 0, 0, w, h);
  }
  ctx.restore();
}

function draw(pose: Pose): void {
  const m = meta.animations[pose.anim];
  if (!m || !sheet.complete) return;

  const { dpr, deviceScale } = metrics;
  const parentDx = Math.round(actor.x * dpr);
  const key = `${pose.anim}:${pose.frame}:${parentDx}:${actor.dir}:${deviceScale}`;
  if (key === lastDrawKey) return; // 見た目が変わらないときは描き直さない
  lastDrawKey = key;

  const sx = pose.frame * meta.frameWidth;
  const sy = m.row * meta.frameHeight;

  // 親ヤマシギのサイズ・位置
  const parentW = meta.frameWidth * deviceScale;
  const parentH = meta.frameHeight * deviceScale;
  const parentDy = 0;

  // 子ヤマシギのサイズ・位置(親より小さく、足元の高さを親とそろえる)
  const childScale = deviceScale * CHILD_SCALE_RATIO;
  const childW = meta.frameWidth * childScale;
  const childH = meta.frameHeight * childScale;
  const childDy = Math.round(FEET_ROW * (deviceScale - childScale));
  const gapPx = Math.round(CHILD_GAP_SPRITE_PX * deviceScale);

  // 子は親の後方に配置
  const childDx =
    actor.dir === 1
      ? Math.round(parentDx - childW - gapPx)
      : Math.round(parentDx + parentW + gapPx);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 子ヤマシギを描画
  drawSprite(sx, sy, childDx, childDy, childW, childH, actor.dir);

  // 親ヤマシギを描画
  drawSprite(sx, sy, parentDx, parentDy, parentW, parentH, actor.dir);
}

// ---- トレイ(通知領域のアイコン)メニューからの指示 ----
function handleCommand(id: string): void {
  if (id === "pause") {
    paused = !paused;
    return;
  }
  if (id in SCALES) {
    settings = { ...settings, scale: SCALES[id] };
    saveSettings(settings);
    void applyLayout(true);
  } else if (id in SPEEDS) {
    settings = { ...settings, speed: SPEEDS[id] };
    saveSettings(settings);
  }
}

// ---- メインループ ----
let last = performance.now();
let pose: Pose = { anim: "idle", frame: 0 };

function loop(now: number): void {
  const dt = Math.min(100, now - last); // 長く止まった後に一気に進まないよう上限を付ける
  last = now;
  if (!paused) pose = actor.update(dt * settings.speed);
  draw(pose);
  requestAnimationFrame(loop);
}

async function boot(): Promise<void> {
  if (!isTauri) document.body.classList.add("dev");

  await new Promise<void>((resolve, reject) => {
    sheet.onload = () => resolve();
    sheet.onerror = () => reject(new Error("ドット絵の読み込みに失敗しました"));
    sheet.src = sheetUrl;
  });

  if (isTauri) await setupTauri();
  await applyLayout(true);
  if (win) await win.show(); // 位置が決まってから表示する(ちらつき防止)

  // タスクバーの位置や画面の拡大率が変わっても追従する
  window.setInterval(() => void applyLayout(), 2000);
  window.addEventListener("resize", () => void applyLayout());

  requestAnimationFrame(loop);
}

boot().catch((err) => console.error(err));
