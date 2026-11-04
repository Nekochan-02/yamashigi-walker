// ヤマシギの「いまの姿勢」を、時間の経過に合わせて決める部分
//
// Brain が決めた行動を、絵のコマ(Pose)と位置(x)に変換する。
// 画面に絵を描く処理とは分けてあるので、単体でテストできる。

import type { Action, ActionKind, BrainContext, Dir, Thinker } from "./brain";

export interface AnimMeta {
  row: number; // スプライトシート内の行
  frames: number;
  fps: number;
}

export interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  groundY: number;
  animations: Record<string, AnimMeta>;
}

/** 描画するコマ: どの動き(anim)の何コマ目(frame)か */
export interface Pose {
  anim: string;
  frame: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
}

/** つつく動作のコマ順。つつく回数ぶん「地面へ → つつく」を繰り返す */
export function peckSequence(pecks: number): number[] {
  const seq = [0, 1, 2];
  for (let i = 1; i < pecks; i++) seq.push(1, 2);
  seq.push(3);
  return seq;
}

const TURN_MS = 400; // 向きを変えるときに立ち止まる時間

export class Actor {
  x: number;
  dir: Dir = 1;

  private action: Action | null = null;
  private prev: ActionKind | null = null;
  private t = 0; // 現在の行動の経過時間(ミリ秒)
  private duration = 0;
  private startX = 0;
  private stepDist = 0;
  private peckSeq: number[] = [];

  constructor(
    private readonly meta: SheetMeta,
    private readonly brain: Thinker,
    private readonly opts: { getStepPx: () => number; getBounds: () => Bounds },
    startX = 0,
  ) {
    this.x = startX;
  }

  /** dtMs ミリ秒ぶん時間を進めて、いま描くべきコマを返す */
  update(dtMs: number): Pose {
    this.clampX();
    if (!this.action) this.begin();
    this.t += dtMs;

    let guard = 0;
    while (this.t >= this.duration && guard++ < 16) {
      const carry = this.t - this.duration;
      this.finish();
      this.begin();
      this.t = carry;
    }
    return this.pose();
  }

  private anim(name: string): AnimMeta {
    const a = this.meta.animations[name];
    if (!a) throw new Error(`アニメーション "${name}" がスプライトシートにありません`);
    return a;
  }

  private begin(): void {
    const { minX, maxX } = this.opts.getBounds();
    const stepPx = this.opts.getStepPx();
    const action = this.brain.next({
      x: this.x,
      dir: this.dir,
      minX,
      maxX,
      stepPx,
      prev: this.prev,
    } satisfies BrainContext);

    this.action = action;
    this.t = 0;
    this.startX = this.x;
    this.stepDist = stepPx;

    switch (action.kind) {
      case "step": {
        const m = this.anim("step");
        this.duration = (m.frames / m.fps) * 1000;
        break;
      }
      case "rock": {
        const m = this.anim(action.flare ? "flare" : "rock");
        this.duration = (m.frames / m.fps) * 1000 * action.count;
        break;
      }
      case "peck": {
        const m = this.anim("peck");
        this.peckSeq = peckSequence(action.pecks);
        this.duration = (this.peckSeq.length / m.fps) * 1000;
        break;
      }
      case "idle":
        this.duration = action.ms;
        break;
      case "turn":
        this.dir = this.dir === 1 ? -1 : 1;
        this.duration = TURN_MS;
        break;
    }
  }

  private finish(): void {
    if (!this.action) return;
    if (this.action.kind === "step") {
      this.x = this.startX + this.dir * this.stepDist;
      this.clampX();
    }
    this.prev = this.action.kind;
    this.action = null;
  }

  private pose(): Pose {
    const a = this.action;
    if (!a) return { anim: "idle", frame: 0 };
    const sec = this.t / 1000;

    switch (a.kind) {
      case "step": {
        const m = this.anim("step");
        this.x = this.startX + this.dir * this.stepDist * Math.min(1, this.t / this.duration);
        return { anim: "step", frame: Math.min(m.frames - 1, Math.floor(sec * m.fps)) };
      }
      case "rock": {
        const name = a.flare ? "flare" : "rock";
        const m = this.anim(name);
        return { anim: name, frame: Math.floor(sec * m.fps) % m.frames };
      }
      case "peck": {
        const m = this.anim("peck");
        const i = Math.min(this.peckSeq.length - 1, Math.floor(sec * m.fps));
        return { anim: "peck", frame: this.peckSeq[i] };
      }
      case "idle": {
        const m = this.anim("idle");
        return { anim: "idle", frame: Math.floor(sec * m.fps) % m.frames };
      }
      case "turn":
        return { anim: "idle", frame: 0 };
    }
  }

  private clampX(): void {
    const { minX, maxX } = this.opts.getBounds();
    this.x = Math.max(minX, Math.min(Math.max(minX, maxX), this.x));
  }
}
