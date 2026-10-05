//! اندروید: sing-box و Aether به‌شکل فایل‌های lib*.so کنار برنامه نصب میشن
//! (تنها پوشه‌ای که اندروید اجازه‌ی اجرای فایل توش رو میده) و VPN با VpnService ساخته میشه.
//!
//! جریان حالت TUN:
//!   برنامه‌ها ──► VpnService (tun) ──► hev-socks5-tunnel ──► sing-box (mixed 127.0.0.1:12334) ──► سرور
//! خود برنامه از VPN مستثنی میشه، پس ترافیک sing-box و Aether مستقیم میره بیرون و حلقه درست نمیشه.

use super::{check_config, data_dir, err, kill_core, singbox_path, spawn_core, tail, Core};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::OnceLock, thread, time::{Duration, Instant}};
use tauri::{AppHandle, Manager};
use tauri_plugin_mvpn::{MvpnExt, StartVpn};

static NATIVE_DIR: OnceLock<PathBuf> = OnceLock::new();

/// مسیر یکی از فایل‌های اجرایی داخل nativeLibraryDir
pub fn bin(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = match NATIVE_DIR.get() {
        Some(d) => d.clone(),
        None => {
            let info = app.mvpn().info()?;
            let d = PathBuf::from(info.native_dir);
            let _ = NATIVE_DIR.set(d.clone());
            d
        }
    };
    let p = dir.join(name);
    if p.exists() {
        Ok(p)
    } else {
        Err(format!("{name} not found in the APK (build problem)"))
    }
}

/// کانفیگ ساخته‌شده برای ویندوز رو برای اندروید آماده می‌کنه.
/// خروجی: آیا کانفیگ اینباند TUN داشت (یعنی باید VPN اندروید روشن بشه)
pub fn fix_config(app: &AppHandle, v: &mut Value) -> bool {
    let mut tun = false;
    if let Some(arr) = v.get_mut("inbounds").and_then(|x| x.as_array_mut()) {
        let before = arr.len();
        arr.retain(|i| i["type"] != "tun");
        tun = arr.len() != before;
    }
    if let Some(r) = v.get_mut("route").and_then(|x| x.as_object_mut()) {
        // بدون روت، sing-box نمی‌تونه اینترفیس شبکه رو مانیتور کنه؛ لازم هم نیست چون برنامه از VPN مستثناست
        r.remove("auto_detect_interface");
        if let Some(rules) = r.get_mut("rules").and_then(|x| x.as_array_mut()) {
            rules.retain(|x| x.get("process_name").is_none());
        }
    }
    let dns = app
        .mvpn()
        .info()
        .ok()
        .and_then(|i| {
            i.dns.iter().find(|d| d.parse::<std::net::Ipv4Addr>().is_ok()).cloned().or_else(|| i.dns.first().cloned())
        })
        .unwrap_or_else(|| "8.8.8.8".to_string());
    if let Some(d) = v.get_mut("dns").and_then(|x| x.as_object_mut()) {
        if let Some(rules) = d.get_mut("rules").and_then(|x| x.as_array_mut()) {
            rules.retain(|x| x.get("process_name").is_none());
        }
        // DNS «local» توی باینری sing-box روی اندروید به resolv.conf تکیه می‌کنه که وجود نداره؛
        // به‌جاش DNS خود شبکه‌ی گوشی (وای‌فای/دیتا) استفاده میشه
        if let Some(servers) = d.get_mut("servers").and_then(|x| x.as_array_mut()) {
            for s in servers.iter_mut() {
                if s["type"] == "local" {
                    let tag = s["tag"].clone();
                    *s = json!({ "type": "udp", "tag": tag, "server": dns });
                }
            }
        }
    }
    tun
}

fn port_open(port: u16) -> bool {
    let a: std::net::SocketAddr = ([127, 0, 0, 1], port).into();
    std::net::TcpStream::connect_timeout(&a, Duration::from_millis(250)).is_ok()
}

pub fn stop_vpn(app: &AppHandle, core: &Core) {
    let mut on = core.vpn_on.lock().unwrap();
    if *on {
        let _ = app.mvpn().stop();
        *on = false;
    }
}

pub fn start_core(app: &AppHandle, config: String, port: u16) -> Result<(), String> {
    let core = app.state::<Core>();
    let mut v: Value = serde_json::from_str(&config).map_err(err)?;
    let tun = fix_config(app, &mut v);
    // عوض کردن سرور وسط اتصال: VPN روشن می‌مونه و فقط sing-box عوض میشه (نشتی نداره)
    if !tun {
        stop_vpn(app, &core);
    }
    kill_core(&core);
    let dir = data_dir(app)?;
    let cfg = dir.join("config.json");
    let log = dir.join("core.log");
    fs::write(&cfg, v.to_string()).map_err(err)?;
    let sb = singbox_path(app)?;
    check_config(&sb, &cfg)?;
    let mut child = spawn_core(&dir, &sb, &cfg, &log)?;
    // صبر تا پروکسی محلی بالا بیاد
    let start = Instant::now();
    loop {
        if let Ok(Some(_)) = child.try_wait() {
            return Err(tail(&log));
        }
        if port_open(port) {
            break;
        }
        if start.elapsed() > Duration::from_secs(8) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("sing-box did not open port {port}. {}", tail(&log)));
        }
        thread::sleep(Duration::from_millis(150));
    }
    *core.child.lock().unwrap() = Some(child);
    if tun && !*core.vpn_on.lock().unwrap() {
        // اولین بار اندروید اجازه‌ی VPN رو از کاربر می‌پرسه
        if let Err(e) = app.mvpn().start(StartVpn { socks_port: port, mtu: 8500 }) {
            kill_core(&core);
            return Err(e);
        }
        *core.vpn_on.lock().unwrap() = true;
    }
    Ok(())
}
