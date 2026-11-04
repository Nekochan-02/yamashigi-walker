import { describe, expect, it } from "vitest";
import { Actor, peckSequence, type SheetMeta } from "./actor";
import type { Action, BrainContext, Thinker } from "./brain";

const meta: SheetMeta = {
  frameWidth: 72,
  frameHeight: 48,
  columns: 8,
  groundY: 44,
  animations: {
    idle: { row: 0, frames: 2, fps: 2 },
    step: { row: 1, frames: 3, fps: 8 }, // 375ms
    rock: { row: 2, frames: 6, fps: 10 }, // 1周600ms
    flare: { row: 3, frames: 6, fps: 10 },
    peck: { row: 4, frames: 4, fps: 7 },
  },
};

/** あらかじめ決めた行動を順番に返す役(テスト用)。最後まで来たら立ち止まる */
class Script implements Thinker {
  readonly seen: BrainContext[] = [];
  constructor(private readonly actions: Action[]) {}
  next(ctx: BrainContext): Action {
    this.seen.push(ctx);
    return this.actions.shift() ?? { kind: "idle", ms: 100000 };
  }
}

function make(actions: Action[], bounds = { minX: 0, maxX: 1000 }, startX = 100) {
  const script = new Script(actions);
  const actor = new Actor(meta, script, { getStepPx: () => 30, getBounds: () => bounds }, startX);
  return { actor, script };
}

describe("peckSequence", () => {
  it("つつく回数に応じてコマ順が伸びる", () => {
    expect(peckSequence(1)).toEqual([0, 1, 2, 3]);
    expect(peckSequence(2)).toEqual([0, 1, 2, 1, 2, 3]);
    expect(peckSequence(3)).toEqual([0, 1, 2, 1, 2, 1, 2, 3]);
  });
});

describe("Actor", () => {
  it("ステップ: 3コマ進み、375msで1歩ぶん(30px)前へ進む", () => {
    const { actor } = make([{ kind: "step" }]);
    expect(actor.update(10)).toEqual({ anim: "step", frame: 0 });
    expect(actor.update(130)).toEqual({ anim: "step", frame: 1 }); // 140ms
    expect(actor.update(130)).toEqual({ anim: "step", frame: 2 }); // 270ms
    expect(actor.x).toBeGreaterThan(100);
    expect(actor.x).toBeLessThan(130);
    actor.update(105); // 375ms を超えた → 次の行動(立ち止まり)へ
    expect(actor.x).toBeCloseTo(130, 5);
  });

  it("ゆらし: 回数ぶん続き、その間は位置が変わらない", () => {
    const { actor } = make([{ kind: "rock", count: 2, flare: false }, { kind: "step" }]);
    const frames: number[] = [];
    for (let i = 0; i < 11; i++) {
      const p = actor.update(100); // 1コマ=100ms(10fps)
      expect(p.anim).toBe("rock");
      frames.push(p.frame);
    }
    expect(frames).toEqual([1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]); // 6コマ×2回(1200ms)の途中まで
    expect(actor.x).toBe(100);
    expect(actor.update(100).anim).toBe("step"); // 1200msで終わり、次の1歩へ
  });

  it("尾を広げるゆらしは flare の絵を使う", () => {
    const { actor } = make([{ kind: "rock", count: 1, flare: true }]);
    expect(actor.update(50).anim).toBe("flare");
  });

  it("つつく: 決められたコマ順(地面へ→つつく→つつく→戻る)で進む", () => {
    const { actor } = make([{ kind: "peck", pecks: 2 }]);
    const frames = [actor.update(1).frame];
    for (let i = 0; i < 5; i++) frames.push(actor.update(1000 / 7).frame); // 1コマ=約143ms(7fps)
    expect(frames).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it("向きを変える: 向きが反転し、立ち止まりの絵を表示する", () => {
    const { actor } = make([{ kind: "turn" }]);
    expect(actor.dir).toBe(1);
    const p = actor.update(10);
    expect(actor.dir).toBe(-1);
    expect(p).toEqual({ anim: "idle", frame: 0 });
  });

  it("左向きのときは左へ進む", () => {
    const { actor } = make([{ kind: "turn" }, { kind: "step" }]);
    actor.update(500); // 向きを変え終わって歩き出す
    actor.update(400); // 歩き終わる
    expect(actor.x).toBeLessThan(100);
  });

  it("Brain には、直前の行動や位置が正しく渡される", () => {
    const { actor, script } = make([{ kind: "step" }, { kind: "rock", count: 1, flare: false }]);
    actor.update(400); // step 完了 → rock 開始
    expect(script.seen[0].prev).toBeNull();
    expect(script.seen[1].prev).toBe("step");
    expect(script.seen[1].x).toBeCloseTo(130, 5);
  });

  it("大きな時間が一度に進んでも、行動が飛ばされず順に処理される", () => {
    const { actor } = make([{ kind: "step" }, { kind: "step" }, { kind: "step" }]);
    actor.update(375 * 3 + 10);
    expect(actor.x).toBeCloseTo(100 + 30 * 3, 5);
  });

  it("動ける範囲の外に出ないよう、位置が補正される", () => {
    const { actor } = make([], { minX: 0, maxX: 50 }, 400);
    actor.update(10);
    expect(actor.x).toBe(50);
  });
});
