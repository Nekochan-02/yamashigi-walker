// リリースビルドで、黒いコンソール画面が一緒に開かないようにする(消さないこと)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yamashigi_walker_lib::run()
}
