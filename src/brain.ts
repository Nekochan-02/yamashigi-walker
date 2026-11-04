// ヤマシギの「次に何をするか」を決める部分(画面や時間には依存しない)
//
// 本物のヤマシギの歩き方(ロッキングウォーク)をもとにしている:
//   1歩進む → 頭を動かさず体だけを前後にゆらす(数回) → 次の1歩 …
// ときどき地面をつついたり、立ち止まったり、向きを変えたりする。

export type Dir = 1 | -1; // 1=右向き, -1=左向き

export type ActionKind = "step" | "rock" | "peck" | "idle" | "turn";

export type Action =
  | { kind: "step" }
  | { kind: "rock"; count: number; flare: boolean } // count=ゆらす回数, flare=尾を広げるか
  | { kind: "peck"; pecks: number } // pecks=つつく回数
  | { kind: "idle"; ms: number } // その場で立ち止まる時間
  | { kind: "turn" };

export interface BrainContext {
  x: number; // いまの位置(画面上の左端からの距離)
  dir: Dir;
  minX: number; // 動ける範囲
  maxX: number;
  stepPx: number; // 1歩で進む距離
  prev: ActionKind | null; // 直前の行動
}

export type Rng = () => number; // 0以上1未満の乱数

/** 次の行動を決める役。テストしやすいよう、行動の決め方だけを切り出している */
export interface Thinker {
  next(ctx: BrainContext): Action;
}

export class Brain implements Thinker {
  constructor(private readonly rng: Rng = Math.random) {}

  next(ctx: BrainContext): Action {
    const r = this.rng;

    // 進む先が範囲の外に出そうなら、向きを変える
    const ahead = ctx.x + ctx.dir * ctx.stepPx * 2;
    if (ahead < ctx.minX || ahead > ctx.maxX) {
      // 向きを変えた直後でもまだ範囲外(画面が狭いなど)なら、動かず待つ
      return ctx.prev === "turn" ? { kind: "idle", ms: 1500 } : { kind: "turn" };
    }

    switch (ctx.prev) {
      case "step":
        // 1歩ごとにゆらすのが基本。ときどきゆらさず続けて歩く
        return r() < 0.8 ? this.rock() : { kind: "step" };
      case "rock": {
        const p = r();
        if (p < 0.72) return { kind: "step" };
        if (p < 0.85) return { kind: "peck", pecks: r() < 0.5 ? 1 : 2 };
        if (p < 0.992) return { kind: "idle", ms: 1500 + Math.floor(r() * 2500) };
        return { kind: "turn" };
      }
      default:
        // 最初、または、つつく・立ち止まる・向きを変えた後は、歩き出す
        return { kind: "step" };
    }
  }

  private rock(): Action {
    const p = this.rng();
    const count = p < 0.45 ? 1 : p < 0.85 ? 2 : 3;
    return { kind: "rock", count, flare: this.rng() < 0.18 };
  }
}
