import { defineConfig } from "vitest/config";

// Tauri(デスクトップアプリの枠組み)が読み込む画面を、Vite(ビルド道具)で作る設定
export default defineConfig({
  clearScreen: false,
  base: "./",
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  build: { target: "es2021", outDir: "dist", emptyOutDir: true },
  test: { environment: "node" },
});
