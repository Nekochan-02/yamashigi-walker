import { describe, expect, it } from "vitest";
import { Brain, type BrainContext, type Rng } from "./brain";

/** 決まった順番で値を返す乱数(テスト用) */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

/** 毎回同じ結果になる疑似乱数(分布の確認用) */
function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base: BrainContext = { x: 500, dir: 1, minX: 0, maxX: 1000, stepPx: 20, prev: null };

describe("Brain", () => {
  it("最初は歩き出す", () => {
    expect(new Brain(seq(0.5)).next(base)).toEqual({ kind: "step" });
  });

  it("1歩のあとは、ふつう体をゆらす(回数は1〜3、尾は広げない)", () => {
    // 1つ目の乱数=ゆらすか続けて歩くか, 2つ目=回数, 3つ目=尾を広げるか
    const a = new Brain(seq(0.1, 0.1, 0.9)).next({ ...base, prev: "step" });
    expect(a).toEqual({ kind: "rock", count: 1, flare: false });
    const b = new Brain(seq(0.1, 0.9, 0.9)).next({ ...base, prev: "step" });
    expect(b).toEqual({ kind: "rock", count: 3, flare: false });
  });

  it("ときどき、ゆらさずに続けて歩く", () => {
    expect(new Brain(seq(0.95)).next({ ...base, prev: "step" })).toEqual({ kind: "step" });
  });

  it("ゆらしの回数は必ず1〜3回で、尾を広げる割合は2割弱", () => {
    const brain = new Brain(mulberry32(1));
    let rocks = 0;
    let flares = 0;
    for (let i = 0; i < 20000; i++) {
      const a = brain.next({ ...base, prev: "step" });
      if (a.kind === "rock") {
        rocks++;
        expect(a.count).toBeGreaterThanOrEqual(1);
        expect(a.count).toBeLessThanOrEqual(3);
        if (a.flare) flares++;
      }
    }
    expect(flares / rocks).toBeGreaterThan(0.14);
    expect(flares / rocks).toBeLessThan(0.22);
  });

  it("ゆらしのあとは、歩く・つつく・立ち止まる・向きを変えるのどれかになる(歩くが最多)", () => {
    const brain = new Brain(mulberry32(7));
    const count: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const a = brain.next({ ...base, prev: "rock" });
      count[a.kind] = (count[a.kind] ?? 0) + 1;
      if (a.kind === "peck") expect([1, 2]).toContain(a.pecks);
      if (a.kind === "idle") {
        expect(a.ms).toBeGreaterThanOrEqual(1500);
        expect(a.ms).toBeLessThan(4000);
      }
    }
    expect(Object.keys(count).sort()).toEqual(["idle", "peck", "step", "turn"]);
    expect(count.step / 20000).toBeGreaterThan(0.68);
    expect(count.step / 20000).toBeLessThan(0.76);
  });

  it("つつく・立ち止まる・向きを変えたあとは、歩き出す", () => {
    for (const prev of ["peck", "idle", "turn"] as const) {
      expect(new Brain(seq(0.5)).next({ ...base, prev })).toEqual({ kind: "step" });
    }
  });

  it("右端に近づいたら向きを変える", () => {
    const a = new Brain(seq(0.5)).next({ ...base, x: 970, dir: 1, prev: "rock" });
    expect(a).toEqual({ kind: "turn" });
  });

  it("左端に近づいたら向きを変える", () => {
    const a = new Brain(seq(0.5)).next({ ...base, x: 30, dir: -1, prev: "step" });
    expect(a).toEqual({ kind: "turn" });
  });

  it("向きを変えた直後でも範囲外のとき(画面が狭いとき)は、動かず待つ", () => {
    const a = new Brain(seq(0.5)).next({ ...base, minX: 0, maxX: 10, prev: "turn" });
    expect(a.kind).toBe("idle");
  });
});
