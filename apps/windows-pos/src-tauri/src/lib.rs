//! Department Store Windows POS — Tauri shell.
//!
//! The React frontend owns all business logic; this shell provides:
//! - the SQLite plugin (counter local database)
//! - `print_raw`: raw ESC/POS byte delivery to a spool queue

use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Writes raw printer bytes to the configured spool directory.
///
/// v1 strategy: bytes are queued as files in `%APPDATA%/departmental-pos/print_queue/`
/// with an atomic rename. A documented spool watcher (or a printer vendor utility
/// listening on the queue directory, e.g. RAW passthrough for ESC/POS) delivers them
/// to the physical printer. This keeps a print failure observable and retryable:
/// the frontend marks the receipt unprinted and offers reprint until delivery is
/// confirmed. Direct Windows Print Spooler API integration is planned once the
/// actual receipt/label printer models are confirmed (docs/known-limitations.md).
#[tauri::command]
fn print_raw(data: Vec<u8>) -> Result<String, String> {
    let queue: PathBuf = dirs::data_dir()
        .ok_or("cannot resolve app data dir")?
        .join("departmental-pos")
        .join("print_queue");
    fs::create_dir_all(&queue).map_err(|e| e.to_string())?;

    let name = format!(
        "job-{}-{}.bin",
        chrono_name(),
        std::process::id()
    );
    let final_path = queue.join(&name);
    let tmp_path = queue.join(format!("{name}.tmp"));

    {
        let mut file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    Ok(final_path.to_string_lossy().into_owned())
}

fn chrono_name() -> String {
    // Millisecond timestamp without pulling a time crate.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    now.as_millis().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![print_raw])
        .run(tauri::generate_context!())
        .expect("error while running POS application");
}
