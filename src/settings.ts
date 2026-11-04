// ユーザー設定(大きさ・速さ)。WebView内のlocalStorageに保存され、次回起動時も引き継がれる

export interface Settings {
  scale: number; // 表示の大きさ(ドット絵1ドットを画面の何ピクセルで表示するか)
  speed: number; // 動きの速さの倍率
}

export const DEFAULT_SETTINGS: Settings = { scale: 1, speed: 1 };

const KEY = "yamashigi-walker.settings";

export const SCALES: Record<string, number> = { size_s: 1, size_m: 2, size_l: 3, size_xl: 4 };
export const SPEEDS: Record<string, number> = {
  speed_slow: 0.7,
  speed_normal: 1,
  speed_fast: 1.6,
  speed_faster: 2.5,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      scale: Object.values(SCALES).includes(p.scale ?? NaN) ? (p.scale as number) : DEFAULT_SETTINGS.scale,
      speed: Object.values(SPEEDS).includes(p.speed ?? NaN) ? (p.speed as number) : DEFAULT_SETTINGS.speed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても動作には影響しない
  }
}
