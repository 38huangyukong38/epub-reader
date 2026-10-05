#[cfg(desktop)]
mod external_open;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        use std::{path::{Path, PathBuf}, sync::Arc};
        use tauri::{Emitter, Manager};
        let pending = Arc::new(external_open::ExternalOpenState::default());
        let cwd = std::env::current_dir().unwrap_or_default();
        pending.enqueue(std::env::args_os().skip(1).map(PathBuf::from), &cwd);
        let requests = pending.clone();
        builder = builder.plugin(tauri_plugin_single_instance::init(move |app, args, cwd| {
            if requests.enqueue(args.into_iter().skip(1).map(PathBuf::from), Path::new(&cwd)) {
                let _ = app.emit("external-epub-open", ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        })).manage(pending).invoke_handler(tauri::generate_handler![
            external_open::take_external_epubs,
            external_open::read_external_epub,
        ]);
    }
    builder
        .run(tauri::generate_context!())
        .expect("failed to run local EPUB reader");
}
