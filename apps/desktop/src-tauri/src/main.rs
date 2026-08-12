// MAMOR-AI デスクトップ — Tauri v2 最小エントリ。
//
// これは WebView2 前提の PC 専用 MVP。Tauri は Vite が出力する ../dist を
// WebView にロードして「ネイティブアプリの皮」をかぶせる薄いラッパである。
// 業務ロジック（入力バリデーション/プリフィル/集計）はフロントの
// @mamorai/input-core が担う。Rust 側は [REQ-025] の保存/印刷/更新の
// #[tauri::command] スケルトンのみを持つ（本実装は Tauri 結合時／最小）。
//
// ※ このスプリントでは cargo build / tauri build は実行しない（設定と雛形のみ）。

// Windows のリリースビルドでコンソール窓を出さない。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

/// [REQ-025] 自動更新チェック結果（フロント TauriBridge.checkUpdate と対応）。
#[derive(Serialize)]
struct UpdateStatus {
    available: bool,
    version: Option<String>,
    notes: Option<String>,
}

/// [REQ-025] ローカル保存（PDF/Excel）。
/// contents は文字列 or バイト列（フロントで number[] へ正規化済み）。
/// 本実装（保存ダイアログ＋書き込み）は Tauri 結合時。ここでは受領を示すスケルトン。
#[tauri::command]
fn save_file(file_name: String, _contents: serde_json::Value, _mime: Option<String>) -> Result<Option<String>, String> {
    // TODO(Tauri結合): tauri-plugin-dialog の save() でパス取得→std::fs::write。
    // 現段階では保存パスを未確定(None)として返す（フロントは saved=false 扱い）。
    let _ = file_name;
    Ok(None)
}

/// [REQ-025] 現在のウィンドウを印刷する。
/// 本実装は WebView の印刷 API 呼び出し（結合時）。ここでは成功のみ返す。
#[tauri::command]
fn print() -> Result<(), String> {
    // TODO(Tauri結合): window.print() 相当を WebView へ発行。
    Ok(())
}

/// [REQ-025] アプリ自動更新の有無を確認する。
/// 本実装は tauri-plugin-updater で最新版を照会（結合時）。ここでは「更新なし」を返す。
#[tauri::command]
fn check_update() -> Result<UpdateStatus, String> {
    // TODO(Tauri結合): updater の check() で available/version/notes を返す。
    Ok(UpdateStatus { available: false, version: None, notes: None })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_file, print, check_update])
        .run(tauri::generate_context!())
        .expect("error while running MAMOR-AI");
}
