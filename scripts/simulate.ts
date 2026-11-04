// 動きのペースを確認するための模擬実行(画面なしで、時間だけを進める)
//   使い方: npx vite-node scripts/simulate.ts
import { Actor, type SheetMeta } from "../src/actor";
import { Brain } from "../src/brain";
import sheetJson from "../src/assets/woodcock_sheet.json";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const meta = sheetJson as SheetMeta;
const SCALE = 1;
const WORLD = 1920;
const CHILD_SCALE_RATIO = 0.6;
const CHILD_GAP = 4 * SCALE;
const parentW = meta.frameWidth * SCALE;
const childW = meta.frameWidth * (SCALE * CHILD_SCALE_RATIO);
const rearSpace = childW + CHILD_GAP;
const offscreenExtra = 16 * SCALE;

const onScreenMinX = rearSpace;
const onScreenMaxX = WORLD - parentW - rearSpace;
const offScreenMinX = -(parentW + CHILD_GAP + childW + offscreenExtra);
const offScreenMaxX = WORLD + CHILD_GAP + childW + offscreenExtra;

type TripState = "inside" | "exiting" | "returning";
let tripState: TripState = "inside";
let tripDir: 1 | -1 = 1;
let evaluatedEdge = false;
let offscreenTrips = 0;

function getBounds(): { minX: number; maxX: number } {
  const currentX = actor ? actor.x : onScreenMinX;
  const currentDir = actor ? actor.dir : 1;

  if (currentX > onScreenMinX + 40 && currentX < onScreenMaxX - 40) {
    evaluatedEdge = false;
  }

  if (tripState === "inside") {
    if (currentDir === 1 && currentX >= onScreenMaxX - 25) {
      if (!evaluatedEdge) {
        evaluatedEdge = true;
        if (Math.random() < 0.35) {
          tripState = "exiting";
          tripDir = 1;
          offscreenTrips++;
        }
      }
    } else if (currentDir === -1 && currentX <= onScreenMinX + 25) {
      if (!evaluatedEdge) {
        evaluatedEdge = true;
        if (Math.random() < 0.35) {
          tripState = "exiting";
          tripDir = -1;
          offscreenTrips++;
        }
      }
    }
  }

  if (tripState === "exiting") {
    if (tripDir === 1) {
      if (currentDir === -1) tripState = "returning";
      return { minX: onScreenMinX, maxX: offScreenMaxX };
    } else {
      if (currentDir === 1) tripState = "returning";
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

let actor: Actor;
actor = new Actor(
  meta,
  new Brain(mulberry32(42)),
  { getStepPx: () => 10 * SCALE, getBounds },
  onScreenMinX,
);

const MINUTES = 30;
const DT = 1000 / 60;
let prevDir = actor.dir;
let turns = 0;
let walked = 0;
let lastX = actor.x;
let minX = Infinity;
let maxX = -Infinity;
const poseMs: Record<string, number> = {};

for (let t = 0; t < MINUTES * 60_000; t += DT) {
  const p = actor.update(DT);
  poseMs[p.anim] = (poseMs[p.anim] ?? 0) + DT;
  if (actor.dir !== prevDir) { turns++; prevDir = actor.dir; }
  walked += Math.abs(actor.x - lastX);
  lastX = actor.x;
  minX = Math.min(minX, actor.x);
  maxX = Math.max(maxX, actor.x);
}

console.log(`${MINUTES}分間・画面幅${WORLD}px・大きさ x${SCALE}`);
console.log(`歩いた距離: ${Math.round(walked)}px (秒速 約${(walked / (MINUTES * 60)).toFixed(1)}px)`);
console.log(`向きを変えた回数: ${turns}`);
console.log(`画面外へ行った回数: ${offscreenTrips}`);
console.log(`位置の範囲: ${Math.round(minX)} 〜 ${Math.round(maxX)} (通常画面内 ${Math.round(onScreenMinX)} 〜 ${Math.round(onScreenMaxX)}, 画面外許容 ${Math.round(offScreenMinX)} 〜 ${Math.round(offScreenMaxX)})`);
console.log("時間の配分:");
for (const [k, v] of Object.entries(poseMs)) {
  console.log(`  ${k.padEnd(6)} ${((v / (MINUTES * 60_000)) * 100).toFixed(1)}%`);
}
