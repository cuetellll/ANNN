//! پل بین Rust و کد Kotlin (VpnService). فقط از سمت Rust صدا زده میشه، نه از UI.
use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartVpn {
    pub socks_port: u16,
    pub mtu: u32,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub native_dir: String,
    #[serde(default)]
    pub dns: Vec<String>,
}

#[derive(Deserialize, Default)]
struct Running {
    #[serde(default)]
    running: bool,
}

pub struct Mvpn<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _p: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> Mvpn<R> {
    #[cfg(target_os = "android")]
    fn call<T: serde::de::DeserializeOwned>(&self, cmd: &str, payload: impl Serialize) -> Result<T, String> {
        self.handle.run_mobile_plugin(cmd, payload).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    fn call<T: serde::de::DeserializeOwned>(&self, _cmd: &str, _payload: impl Serialize) -> Result<T, String> {
        Err("android only".into())
    }

    pub fn info(&self) -> Result<Info, String> {
        self.call("info", serde_json::json!({}))
    }
    pub fn start(&self, a: StartVpn) -> Result<(), String> {
        self.call::<serde_json::Value>("startVpn", a).map(|_| ())
    }
    pub fn stop(&self) -> Result<(), String> {
        self.call::<serde_json::Value>("stopVpn", serde_json::json!({})).map(|_| ())
    }
    pub fn running(&self) -> bool {
        self.call::<Running>("status", serde_json::json!({})).map(|r| r.running).unwrap_or(false)
    }
    pub fn open_url(&self, url: &str) -> Result<(), String> {
        self.call::<serde_json::Value>("openUrl", serde_json::json!({ "url": url })).map(|_| ())
    }
}

pub trait MvpnExt<R: Runtime> {
    fn mvpn(&self) -> &Mvpn<R>;
}

impl<R: Runtime, T: Manager<R>> MvpnExt<R> for T {
    fn mvpn(&self) -> &Mvpn<R> {
        self.state::<Mvpn<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mvpn")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin("com.mahyar.vpn.plugin", "VpnPlugin")?;
                app.manage(Mvpn { handle });
            }
            #[cfg(not(target_os = "android"))]
            app.manage(Mvpn::<R> { _p: std::marker::PhantomData });
            Ok(())
        })
        .build()
}
