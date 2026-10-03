// Commands of xjyutping-Tool: compile the vocabulary list with the bundled
// Tectonic, and read and write lesson and corrections files chosen in dialogs.
// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::BTreeSet, fs, path::PathBuf, process::Command};

use serde::Serialize;
use tauri::{async_runtime::Mutex, AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Exports share one job directory, so they run one at a time.
#[derive(Default)]
struct ExportLock(Mutex<()>);

#[derive(Serialize)]
struct Exported {
    path: Option<String>,
    /// characters the log reports as missing from both fonts
    missing: BTreeSet<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// A file name from a lesson title: only the characters no file system allows are removed.
fn file_name(title: &str, ext: &str) -> String {
    let name: String = title
        .chars()
        .filter(|c| !c.is_control() && !r#"\/:*?"<>|"#.contains(*c))
        .collect();
    let name = name.trim().trim_end_matches('.');
    format!("{}.{ext}", if name.is_empty() { "lesson" } else { name })
}

fn with_ext(mut path: PathBuf, ext: &str) -> PathBuf {
    if path.extension().is_none_or(|e| !e.eq_ignore_ascii_case(ext)) {
        let name = format!("{}.{ext}", path.file_name().unwrap_or_default().to_string_lossy());
        path.set_file_name(name);
    }
    path
}

fn missing_chars(log: &str) -> BTreeSet<String> {
    log.lines()
        .filter_map(|l| l.split("Missing character: There is no ").nth(1))
        .filter_map(|rest| rest.chars().next().map(String::from))
        .collect()
}

fn tail(text: &str) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(12)..].join("\n")
}

/// Compiles `tex` with the bundled Tectonic in the app's cache folder and
/// returns the PDF and the characters the log reports as missing from both fonts.
async fn compile(app: &AppHandle, tex: String) -> Result<(PathBuf, BTreeSet<String>), String> {
    let cache = app.path().app_cache_dir().map_err(err)?;
    let job = cache.join("job");
    fs::create_dir_all(&job).map_err(err)?;
    let source = job.join("lesson.tex");
    let pdf = job.join("lesson.pdf");
    fs::write(&source, tex).map_err(err)?;
    let _ = fs::remove_file(&pdf);
    // the sidecar sits next to the app's executable (tectonic.exe on Windows);
    // tauri's current_exe resolves a symlinked exe, as the shell plugin did
    let exe = tauri::utils::platform::current_exe().map_err(err)?;
    let mut tectonic = Command::new(exe.with_file_name(format!("tectonic{}", std::env::consts::EXE_SUFFIX)));
    // the relative bundle path, resolved from the resource dir, avoids Tectonic
    // reading a Windows path such as C:\... as a URL
    tectonic
        .current_dir(app.path().resource_dir().map_err(err)?)
        .env("TECTONIC_CACHE_DIR", cache.join("tectonic"))
        .args(["-b", "texbundle", "--untrusted", "--chatter", "minimal", "--keep-logs"])
        .arg(&source);
    // no console window flashing up on Windows (CREATE_NO_WINDOW)
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut tectonic, 0x0800_0000);
    let out = tauri::async_runtime::spawn_blocking(move || tectonic.output())
        .await
        .map_err(err)?
        .map_err(err)?;
    if !out.status.success() || !pdf.exists() {
        // Tectonic ends with a generic "caused by" line; the cause is its first "error:" line
        let stderr = String::from_utf8_lossy(&out.stderr);
        let cause = stderr.lines().find(|l| l.starts_with("error:")).unwrap_or("");
        return Err(format!("The PDF could not be made:\n{}\n{cause}", tail(&stderr)));
    }
    let missing = missing_chars(&fs::read_to_string(job.join("lesson.log")).unwrap_or_default());
    Ok((pdf, missing))
}

#[tauri::command]
async fn export_pdf(
    app: AppHandle,
    lock: State<'_, ExportLock>,
    tex: String,
    name: String,
) -> Result<Exported, String> {
    let _one = lock.0.lock().await;
    let (pdf, missing) = compile(&app, tex).await?;
    let Some(dest) = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(file_name(&name, "pdf"))
        .blocking_save_file()
    else {
        return Ok(Exported { path: None, missing });
    };
    let dest = with_ext(dest.into_path().map_err(err)?, "pdf");
    fs::copy(&pdf, &dest).map_err(err)?;
    let shown = dest.display().to_string();
    app.opener().open_path(shown.clone(), None::<&str>).map_err(err)?;
    Ok(Exported { path: Some(shown), missing })
}

/// `--self-test <report file>` on the command line: the window reads a sample
/// lesson, the app compiles it without asking where to save, writes a report
/// to the file and quits with 0 on success (used to check a built app, as in CI).
fn self_test_report() -> Option<PathBuf> {
    let mut args = std::env::args().skip_while(|a| a != "--self-test");
    args.next()?;
    args.next().map(PathBuf::from)
}

#[tauri::command]
fn self_test() -> bool {
    self_test_report().is_some()
}

#[tauri::command]
async fn self_test_done(
    app: AppHandle,
    lock: State<'_, ExportLock>,
    mut report: String,
    tex: Option<String>,
) -> Result<(), String> {
    let Some(path) = self_test_report() else {
        return Err("not in self-test mode".into());
    };
    let _one = lock.0.lock().await;
    let mut ok = tex.is_some();
    if let Some(tex) = tex {
        match compile(&app, tex).await {
            Ok((pdf, missing)) => report.push_str(&format!(
                "\npdf: {} ({} bytes), missing glyphs: {}",
                pdf.display(),
                fs::metadata(&pdf).map_or(0, |m| m.len()),
                missing.len()
            )),
            Err(e) => {
                ok = false;
                report.push_str(&format!("\ncompile failed: {e}"));
            }
        }
    }
    report.push_str(if ok { "\nself-test ok\n" } else { "\nself-test FAILED\n" });
    fs::write(&path, report).map_err(err)?;
    app.exit(if ok { 0 } else { 1 });
    Ok(())
}

#[tauri::command]
async fn open_lesson(app: AppHandle) -> Result<Option<(String, String)>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("Lesson", &["jyutlesson"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(err)?;
    let text = fs::read_to_string(&path).map_err(err)?;
    Ok(Some((path.display().to_string(), text)))
}

/// Writes the lesson to `path` (a lesson file opened or saved before) or to a
/// path chosen in a dialog. Only .jyutlesson files are ever written.
#[tauri::command]
async fn save_lesson(
    app: AppHandle,
    contents: String,
    name: String,
    path: Option<String>,
) -> Result<Option<String>, String> {
    let known = path.filter(|p| p.to_lowercase().ends_with(".jyutlesson"));
    let dest = match known {
        Some(p) => PathBuf::from(p),
        None => match app
            .dialog()
            .file()
            .add_filter("Lesson", &["jyutlesson"])
            .set_file_name(file_name(&name, "jyutlesson"))
            .blocking_save_file()
        {
            Some(p) => with_ext(p.into_path().map_err(err)?, "jyutlesson"),
            None => return Ok(None),
        },
    };
    fs::write(&dest, contents).map_err(err)?;
    Ok(Some(dest.display().to_string()))
}

#[tauri::command]
async fn export_corrections(
    app: AppHandle,
    contents: String,
    name: String,
) -> Result<Option<String>, String> {
    let Some(dest) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(file_name(name.trim_end_matches(".json"), "json"))
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let dest = with_ext(dest.into_path().map_err(err)?, "json");
    fs::write(&dest, contents).map_err(err)?;
    let _ = app.opener().reveal_item_in_dir(&dest);
    Ok(Some(dest.display().to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(ExportLock::default())
        .invoke_handler(tauri::generate_handler![
            export_pdf,
            open_lesson,
            save_lesson,
            export_corrections,
            self_test,
            self_test_done
        ])
        .run(tauri::generate_context!())
        .expect("error while running xjyutping-Tool");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_logs() {
        assert_eq!(file_name("第一課: 飲茶?", "pdf"), "第一課 飲茶.pdf");
        assert_eq!(file_name(" / ", "pdf"), "lesson.pdf");
        assert_eq!(with_ext(PathBuf::from("a/b"), "pdf"), PathBuf::from("a/b.pdf"));
        assert_eq!(with_ext(PathBuf::from("a/b.PDF"), "pdf"), PathBuf::from("a/b.PDF"));
        let log = "Missing character: There is no 𢯎 (U+22BCE) in font I.Ming!\nok\n\
                   Missing character: There is no 𢯎 (U+22BCE) in font Noto!";
        assert_eq!(missing_chars(log), BTreeSet::from(["𢯎".to_string()]));
    }
}
