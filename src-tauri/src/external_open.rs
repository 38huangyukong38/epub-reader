use serde::Serialize;
use std::{collections::{HashMap, VecDeque}, path::{Path, PathBuf}, sync::{Arc, Mutex}};
use tauri::ipc::Response;

#[derive(Clone, Serialize)]
pub struct ExternalEpub {
    id: String,
    name: String,
}

#[derive(Default)]
struct PendingFiles {
    next_id: u64,
    queue: VecDeque<ExternalEpub>,
    paths: HashMap<String, PathBuf>,
}

#[derive(Default)]
pub struct ExternalOpenState {
    pending: Mutex<PendingFiles>,
}

pub fn epub_path(argument: &Path, cwd: &Path) -> Option<PathBuf> {
    if !argument.extension()?.to_str()?.eq_ignore_ascii_case("epub") { return None; }
    Some(if argument.is_absolute() { argument.to_path_buf() } else { cwd.join(argument) })
}

impl ExternalOpenState {
    pub fn enqueue(&self, arguments: impl IntoIterator<Item = PathBuf>, cwd: &Path) -> bool {
        let Ok(mut pending) = self.pending.lock() else { return false; };
        let mut added = false;
        for argument in arguments {
            let Some(path) = epub_path(&argument, cwd) else { continue; };
            let Some(name) = path.file_name().map(|name| name.to_string_lossy().into_owned()) else { continue; };
            pending.next_id += 1;
            let id = pending.next_id.to_string();
            pending.paths.insert(id.clone(), path);
            pending.queue.push_back(ExternalEpub { id, name });
            added = true;
        }
        added
    }
}

#[tauri::command]
pub fn take_external_epubs(state: tauri::State<'_, Arc<ExternalOpenState>>) -> Result<Vec<ExternalEpub>, String> {
    let mut pending = state.pending.lock().map_err(|_| "无法读取待打开文件".to_owned())?;
    Ok(pending.queue.drain(..).collect())
}

#[tauri::command]
pub async fn read_external_epub(id: String, state: tauri::State<'_, Arc<ExternalOpenState>>) -> Result<Response, String> {
    let path = state.pending.lock().map_err(|_| "无法读取文件".to_owned())?
        .paths.remove(&id).ok_or_else(|| "该文件打开请求已失效".to_owned())?;
    tauri::async_runtime::spawn_blocking(move || {
        if !path.is_file() { return Err("找不到该 EPUB，请检查文件是否已移动或删除".to_owned()); }
        std::fs::read(path).map(Response::new).map_err(|error| format!("无法读取 EPUB：{error}"))
    }).await.map_err(|_| "读取 EPUB 失败".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_epub_paths_with_spaces_and_unicode_but_not_other_arguments() {
        let cwd = Path::new("reader-folder");
        assert_eq!(epub_path(Path::new("中文 book.EPUB"), cwd), Some(cwd.join("中文 book.EPUB")));
        assert!(epub_path(Path::new("notes.txt"), cwd).is_none());
        assert!(epub_path(Path::new("--help"), cwd).is_none());
    }

    #[test]
    fn retains_cold_and_warm_requests_until_the_frontend_drains_them() {
        let state = ExternalOpenState::default();
        let cwd = Path::new("reader-folder");
        state.enqueue([PathBuf::from("first.epub")], cwd);
        state.enqueue([PathBuf::from("second.epub")], cwd);
        let mut pending = state.pending.lock().unwrap();
        let requests: Vec<_> = pending.queue.drain(..).collect();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].name, "first.epub");
        assert_eq!(requests[1].name, "second.epub");
        assert_ne!(requests[0].id, requests[1].id);
        assert_eq!(pending.paths.len(), 2);
    }
}
