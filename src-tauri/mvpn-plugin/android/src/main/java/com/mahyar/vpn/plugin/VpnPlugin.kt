package com.mahyar.vpn.plugin

import android.app.Activity
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.net.VpnService
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class StartArgs {
    var socksPort: Int = 12334
    var mtu: Int = 8500
}

@InvokeArg
class UrlArgs {
    var url: String = ""
}

@TauriPlugin
class VpnPlugin(private val activity: Activity) : Plugin(activity) {
    private var pending: StartArgs? = null

    /** مسیر فایل‌های اجرایی (sing-box / Aether) و DNSهای شبکه‌ی فعلی */
    @Command
    fun info(invoke: Invoke) {
        val ret = JSObject()
        ret.put("nativeDir", activity.applicationInfo.nativeLibraryDir)
        val dns = JSArray()
        try {
            val cm = activity.getSystemService(ConnectivityManager::class.java)
            val lp = cm.getLinkProperties(cm.activeNetwork)
            lp?.dnsServers?.forEach { a -> a.hostAddress?.let { dns.put(it.substringBefore('%')) } }
        } catch (_: Throwable) {}
        ret.put("dns", dns)
        invoke.resolve(ret)
    }

    @Command
    fun startVpn(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)
        val ask = VpnService.prepare(activity)
        if (ask != null) {
            pending = args
            startActivityForResult(invoke, ask, "vpnPermissionResult")
        } else {
            launch(invoke, args)
        }
    }

    @ActivityCallback
    private fun vpnPermissionResult(invoke: Invoke, result: ActivityResult) {
        val args = pending ?: StartArgs()
        pending = null
        if (result.resultCode == Activity.RESULT_OK) launch(invoke, args)
        else invoke.reject("VPN permission denied · اجازه‌ی VPN داده نشد")
    }

    private fun launch(invoke: Invoke, args: StartArgs) {
        MvpnService.state = 1
        MvpnService.lastError = null
        val i = Intent(activity, MvpnService::class.java)
            .setAction(MvpnService.ACTION_START)
            .putExtra(MvpnService.EXTRA_PORT, args.socksPort)
            .putExtra(MvpnService.EXTRA_MTU, args.mtu)
        try {
            activity.startService(i)
        } catch (e: Throwable) {
            invoke.reject("Cannot start VPN service: ${e.message}")
            return
        }
        // منتظر می‌مونیم تا سرویس tun رو بسازه
        Thread {
            val until = System.currentTimeMillis() + 8000
            while (System.currentTimeMillis() < until && MvpnService.state == 1) Thread.sleep(80)
            when (MvpnService.state) {
                2 -> invoke.resolve()
                3 -> invoke.reject(MvpnService.lastError ?: "VPN failed")
                else -> invoke.reject("VPN did not start (timeout)")
            }
        }.start()
    }

    @Command
    fun stopVpn(invoke: Invoke) {
        try {
            activity.startService(Intent(activity, MvpnService::class.java).setAction(MvpnService.ACTION_STOP))
        } catch (_: Throwable) {}
        invoke.resolve()
    }

    @Command
    fun status(invoke: Invoke) {
        val ret = JSObject()
        ret.put("running", MvpnService.state == 2)
        invoke.resolve(ret)
    }

    @Command
    fun openUrl(invoke: Invoke) {
        val args = invoke.parseArgs(UrlArgs::class.java)
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(args.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            invoke.resolve()
        } catch (e: Throwable) {
            invoke.reject(e.message ?: "cannot open url")
        }
    }
}
