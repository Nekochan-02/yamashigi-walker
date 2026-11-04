// 画面の「作業領域」(タスクバーを除いた領域)の読み取りと、描画サイズの計算

export interface WorkArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 作業領域を読み取る。
 * WebView2(Windowsの表示部品)では window.screen.avail* が、タスクバーを除いた領域を返す。
 * Tauriなしのブラウザ(開発用)では、ブラウザのウィンドウ全体を使う。
 */
export function readWorkArea(isTauri: boolean): WorkArea {
  if (!isTauri) {
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    left: s.availLeft ?? 0,
    top: s.availTop ?? 0,
    width: s.availWidth,
    height: s.availHeight,
  };
}

export interface Metrics {
  dpr: number; // 画面の拡大率(1.0=100%, 1.5=150% など)
  deviceScale: number; // ドット絵1ドットを何「実ピクセル」で描くか(整数にして、ドットをくっきりさせる)
  drawScale: number; // 同じ値を、画面上の長さ(CSSピクセル)で表したもの
}

/** 画面の拡大率が 125% などでも、ドットがにじまないよう整数倍に丸める */
export function computeMetrics(userScale: number, dpr: number): Metrics {
  const deviceScale = Math.max(1, Math.round(userScale * dpr));
  return { dpr, deviceScale, drawScale: deviceScale / dpr };
}
