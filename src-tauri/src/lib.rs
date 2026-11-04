//! ヤマシギ・タスクバーウォーカー(Windows側の殻)
//!
//! この部分の役割は、通知領域(タスクバー右端)のアイコンとメニューを用意することだけ。
//! 窓の位置合わせ・クリックスルー・ヤマシギの動きは、画面側(src/ の TypeScript)が行う。
//! メニューが選ばれると、その項目の名前を "tray-command" という合図で画面側へ送る。

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let pause = MenuItem::with_id(app, "pause", "一時停止 / 再開", true, None::<&str>)?;

            let size_s = MenuItem::with_id(app, "size_s", "小(標準)", true, None::<&str>)?;
            let size_m = MenuItem::with_id(app, "size_m", "中", true, None::<&str>)?;
            let size_l = MenuItem::with_id(app, "size_l", "大(以前の標準の大きさ)", true, None::<&str>)?;
            let size_xl = MenuItem::with_id(app, "size_xl", "特大", true, None::<&str>)?;
            let size_menu =
                Submenu::with_items(app, "大きさ", true, &[&size_s, &size_m, &size_l, &size_xl])?;

            let speed_slow = MenuItem::with_id(app, "speed_slow", "ゆっくり", true, None::<&str>)?;
            let speed_normal = MenuItem::with_id(app, "speed_normal", "ふつう", true, None::<&str>)?;
            let speed_fast = MenuItem::with_id(app, "speed_fast", "はやい", true, None::<&str>)?;
            let speed_faster = MenuItem::with_id(app, "speed_faster", "とてもはやい", true, None::<&str>)?;
            let speed_menu = Submenu::with_items(
                app,
                "速さ",
                true,
                &[&speed_slow, &speed_normal, &speed_fast, &speed_faster],
            )?;

            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&pause, &size_menu, &speed_menu, &separator, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ヤマシギ")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    id => {
                        let _ = app.emit("tray-command", id.to_string());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("アプリの起動に失敗しました");
}
