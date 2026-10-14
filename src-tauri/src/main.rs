// Commands of xjyutping-Tool: compile the vocabulary list with the bundled
// Tectonic, read and write lesson and corrections files chosen in dialogs, and
// find the fonts the teacher installed that the app may not include.
// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::BTreeSet, fs, path::{Path, PathBuf}, process::Command};

use serde::{Deserialize, Serialize};
use tauri::{async_runtime::Mutex, AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Exports share one job directory, so they run one at a time.
#[derive(Default)]
struct ExportLock(Mutex<()>);

#[derive(Serialize)]
struct Exported {
    path: Option<String>,
    /// characters the log reports as missing from the chosen fonts
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

/// A font of py/fonts.json that the teacher installs ("system"), found by its
/// PostScript name; `file` is the name it is copied under next to the lesson.
#[derive(Deserialize)]
struct SystemFontRef {
    postscript: String,
    hint: String,
    file: String,
}

#[derive(Serialize)]
struct SystemFont {
    path: String,
    /// the code points the font has a glyph for
    ranges: Vec<(u32, u32)>,
}

/// The folders fonts are installed in, for all users and for this one.
fn font_dirs() -> Vec<PathBuf> {
    let var = |k| std::env::var_os(k).map(PathBuf::from);
    if cfg!(windows) {
        let windows = var("WINDIR").unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
        [Some(windows.join("Fonts")), var("LOCALAPPDATA").map(|d| d.join(r"Microsoft\Windows\Fonts"))]
    } else {
        [Some(PathBuf::from("/Library/Fonts")), var("HOME").map(|d| d.join("Library/Fonts"))]
    }
    .into_iter()
    .flatten()
    .collect()
}

/// The installed font file with this PostScript name.
fn find_font(postscript: &str, hint: &str) -> Option<(PathBuf, Vec<u8>)> {
    find_font_in(font_dirs(), postscript, hint)
}

/// The font file with this PostScript name in `dirs`. Only the files whose name
/// contains `hint` (letters and digits, in any case) are read, two folders deep.
fn find_font_in(dirs: Vec<PathBuf>, postscript: &str, hint: &str) -> Option<(PathBuf, Vec<u8>)> {
    let squash = |s: &str| s.chars().filter(char::is_ascii_alphanumeric).collect::<String>().to_ascii_lowercase();
    let hint = squash(hint);
    let mut dirs: Vec<(PathBuf, u8)> = dirs.into_iter().map(|d| (d, 0)).collect();
    while let Some((dir, depth)) = dirs.pop() {
        for entry in fs::read_dir(&dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                if depth < 2 {
                    dirs.push((path, depth + 1));
                }
            } else if squash(&entry.file_name().to_string_lossy()).contains(&hint) {
                if let Ok(data) = fs::read(&path) {
                    if postscript_name(&data).as_deref() == Some(postscript) {
                        return Some((path, data));
                    }
                }
            }
        }
    }
    None
}

fn postscript_name(data: &[u8]) -> Option<String> {
    let face = ttf_parser::Face::parse(data, 0).ok()?;
    face.names().into_iter().filter(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME).find_map(|n| n.to_string())
}

/// The code points the font maps to a glyph, as ranges.
fn code_point_ranges(data: &[u8]) -> Vec<(u32, u32)> {
    let mut cps = BTreeSet::new();
    if let Ok(face) = ttf_parser::Face::parse(data, 0) {
        for table in face.tables().cmap.into_iter().flat_map(|c| c.subtables) {
            if table.is_unicode() {
                table.codepoints(|c| {
                    if table.glyph_index(c).is_some_and(|g| g.0 != 0) {
                        cps.insert(c);
                    }
                });
            }
        }
    }
    let mut ranges: Vec<(u32, u32)> = vec![];
    for c in cps {
        match ranges.last_mut() {
            Some(r) if r.1 + 1 == c => r.1 = c,
            _ => ranges.push((c, c)),
        }
    }
    ranges
}

/// Where an installed font is and what it covers, or None if it is not installed.
#[tauri::command]
async fn system_font(postscript: String, hint: String) -> Option<SystemFont> {
    let (path, data) = find_font(&postscript, &hint)?;
    Some(SystemFont { path: path.display().to_string(), ranges: code_point_ranges(&data) })
}

/// The bytes of an installed font, for the window to show it.
#[tauri::command]
async fn system_font_data(postscript: String, hint: String) -> Result<tauri::ipc::Response, String> {
    let (_, data) = find_font(&postscript, &hint).ok_or(format!("{postscript} is not installed"))?;
    Ok(tauri::ipc::Response::new(data))
}

fn tail(text: &str) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(12)..].join("\n")
}

/// Removes the copies of installed fonts from the job folder, which holds no other font.
fn remove_fonts(job: &Path) {
    for entry in fs::read_dir(job).into_iter().flatten().flatten() {
        let path = entry.path();
        let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase());
        if matches!(ext.as_deref(), Some("otf" | "ttf" | "otc" | "ttc")) {
            let _ = fs::remove_file(path);
        }
    }
}

/// Compiles `tex` with the bundled Tectonic in the app's cache folder and
/// returns the PDF and the characters the log reports as missing from the chosen fonts.
/// The installed fonts it uses are copied next to the lesson for this compile only
/// (callers hold the ExportLock, so no other compile uses the folder meanwhile).
async fn compile(app: &AppHandle, tex: String, fonts: &[SystemFontRef]) -> Result<(PathBuf, BTreeSet<String>), String> {
    let cache = app.path().app_cache_dir().map_err(err)?;
    let job = cache.join("job");
    fs::create_dir_all(&job).map_err(err)?;
    remove_fonts(&job);
    let result = async {
        for f in fonts {
            let name = Path::new(&f.file).file_name().filter(|n| *n == f.file.as_str());
            let (Some(name), Some((_, data))) = (name, find_font(&f.postscript, &f.hint)) else {
                return Err(format!("{} is not installed on this computer.", f.postscript));
            };
            fs::write(job.join(name), data).map_err(err)?;
        }
        run_tectonic(app, &cache, &job, tex).await
    }
    .await;
    remove_fonts(&job);
    result
}

async fn run_tectonic(app: &AppHandle, cache: &Path, job: &Path, tex: String) -> Result<(PathBuf, BTreeSet<String>), String> {
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
    fonts: Vec<SystemFontRef>,
) -> Result<Exported, String> {
    let _one = lock.0.lock().await;
    let (pdf, missing) = compile(&app, tex, &fonts).await?;
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

/// A TeX source of the self-test, with the installed fonts it uses.
#[derive(Deserialize)]
struct SelfTestJob {
    tex: String,
    fonts: Vec<SystemFontRef>,
}

#[tauri::command]
async fn self_test_done(
    app: AppHandle,
    lock: State<'_, ExportLock>,
    mut report: String,
    jobs: Option<Vec<SelfTestJob>>,
) -> Result<(), String> {
    let Some(path) = self_test_report() else {
        return Err("not in self-test mode".into());
    };
    let _one = lock.0.lock().await;
    let mut ok = jobs.is_some();
    if let Some(window) = app.get_webview_window("main") {
        let (fits, how) = fits_screen(&window);
        report.push_str(&format!("\nwindow: {how}"));
        ok &= fits;
    }
    for job in jobs.unwrap_or_default() {
        let files: Vec<String> = job.fonts.iter().map(|f| f.file.clone()).collect();
        match compile(&app, job.tex, &job.fonts).await {
            Ok((pdf, missing)) => {
                // an installed font was loaded by TeX (fontspec logs its file) and its copy is gone again
                let dir = pdf.parent().unwrap_or(Path::new("."));
                let log = fs::read_to_string(dir.join("lesson.log")).unwrap_or_default();
                let used = files.iter().all(|f| log.contains(f.as_str()));
                let removed = files.iter().all(|f| !dir.join(f).exists());
                ok &= used && removed;
                report.push_str(&format!(
                    "\npdf{}: {} ({} bytes), missing glyphs: {}{}",
                    if files.is_empty() { String::new() } else { format!(" with {}", files.join(", ")) },
                    pdf.display(),
                    fs::metadata(&pdf).map_or(0, |m| m.len()),
                    missing.len(),
                    match (files.is_empty(), used, removed) {
                        (true, ..) => "",
                        (false, true, true) => ", the font was used and its copy removed",
                        (false, false, _) => ", the font was NOT used",
                        (false, true, false) => ", the copy of the font was NOT removed",
                    }
                ));
            }
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

/// Whether the window's content lies within the usable part of its screen
/// (without the taskbar or the Dock), with the sizes, for the self-test.
fn fits_screen(window: &WebviewWindow) -> (bool, String) {
    let (Ok(Some(monitor)), Ok(pos), Ok(size)) = (window.current_monitor(), window.inner_position(), window.inner_size()) else {
        return (true, "no screen information".into());
    };
    let area = monitor.work_area();
    let fits = pos.x >= area.position.x
        && pos.y >= area.position.y
        && pos.x + size.width as i32 <= area.position.x + area.size.width as i32
        && pos.y + size.height as i32 <= area.position.y + area.size.height as i32;
    let how = format!("{}x{} at ({}, {}) in a {}x{} area at ({}, {}), {}", size.width, size.height, pos.x, pos.y,
        area.size.width, area.size.height, area.position.x, area.position.y, if fits { "fits" } else { "does not fit" });
    (fits, how)
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
        // a copy of an installed font left by a compile the app did not finish
        .setup(|app| {
            if let Ok(cache) = app.path().app_cache_dir() {
                remove_fonts(&cache.join("job"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            export_pdf,
            system_font,
            system_font_data,
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

    #[test]
    fn font_names_and_coverage() {
        // a bundled font stands in for an installed one (scripts/vendor.mjs puts it there)
        let Ok(data) = fs::read("resources/texbundle/AtkinsonHyperlegible-Regular.ttf") else { return };
        assert_eq!(postscript_name(&data).as_deref(), Some("AtkinsonHyperlegible-Regular"));
        let ranges = code_point_ranges(&data);
        assert!(ranges.iter().any(|&(a, b)| a <= 'a' as u32 && 'z' as u32 <= b));
        assert!(ranges.windows(2).all(|w| w[0].1 + 1 < w[1].0));
    }

    #[test]
    fn finds_installed_fonts() {
        // the commercial fonts, when the workspace has a copy (not in git), stand in for installed ones
        let dir = PathBuf::from("../../fonts");
        if !dir.is_dir() {
            return;
        }
        for (postscript, hint) in [("KuMincho-Regular", "KuMincho"), ("PrisonGothic-Md", "PrisonGothic")] {
            let (path, data) = find_font_in(vec![dir.clone()], postscript, hint).expect(postscript);
            assert!(path.extension().is_some_and(|e| e == "otf"));
            assert!(code_point_ranges(&data).iter().any(|&(a, b)| a <= '好' as u32 && '好' as u32 <= b));
        }
        assert!(find_font_in(vec![dir], "KuMincho-Regular", "PrisonGothic").is_none());
    }
}
