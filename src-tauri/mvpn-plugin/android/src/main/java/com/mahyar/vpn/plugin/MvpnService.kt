package com.mahyar.vpn.plugin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import java.io.File

/**
 * VPN کل گوشی: همه‌ی ترافیک میره توی tun، hev-socks5-tunnel اون رو تحویل
 * SOCKS5 محلی sing-box (127.0.0.1:port) میده. خود برنامه از VPN مستثناست
 * تا ترافیک sing-box/Aether دوباره نیفته توی تونل.
 */
class MvpnService : VpnService() {
    companion object {
        const val ACTION_START = "com.mahyar.vpn.START"
        const val ACTION_STOP = "com.mahyar.vpn.STOP"
        const val EXTRA_PORT = "port"
        const val EXTRA_MTU = "mtu"
        private const val CHANNEL = "mahyarvpn"
        private const val NOTIF_ID = 1819

        /** 0 = خاموش، 1 = در حال روشن شدن، 2 = روشن، 3 = خطا */
        @Volatile var state: Int = 0
        @Volatile var lastError: String? = null
    }

    private var tun: ParcelFileDescriptor? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdown()
                state = 0
                // فقط اگه بعدش درخواست START نیومده باشه سرویس بسته میشه
                stopSelf(startId)
            }
            ACTION_START -> {
                val port = intent.getIntExtra(EXTRA_PORT, 12334)
                val mtu = intent.getIntExtra(EXTRA_MTU, 8500)
                startTunnel(port, mtu)
            }
        }
        return START_NOT_STICKY
    }

    private fun startTunnel(port: Int, mtu: Int) {
        shutdown()
        state = 1
        lastError = null
        try {
            goForeground()
            val b = Builder()
                .setSession("MahyarVPN")
                .setMtu(mtu)
                .addAddress("172.19.0.1", 30)
                .addRoute("0.0.0.0", 0)
                .addAddress("fdfe:dcba:9876::1", 126)
                .addRoute("::", 0)
                .addDnsServer("1.1.1.1")
                .addDisallowedApplication(packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) b.setMetered(false)
            val launch = packageManager.getLaunchIntentForPackage(packageName)
            if (launch != null) {
                b.setConfigureIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE))
            }
            val fd = b.establish() ?: throw IllegalStateException("VPN permission was not granted")
            tun = fd

            val cfg = File(cacheDir, "hev.yml")
            cfg.writeText(
                """
                tunnel:
                  mtu: $mtu
                  ipv4: 172.19.0.1
                  ipv6: 'fdfe:dcba:9876::1'
                socks5:
                  port: $port
                  address: 127.0.0.1
                  udp: 'udp'
                misc:
                  task-stack-size: 81920
                  tcp-read-write-timeout: 300000
                  udp-read-write-timeout: 60000
                  log-level: warn
                """.trimIndent()
            )
            TProxyService.TProxyStartService(cfg.absolutePath, fd.fd)
            state = 2
        } catch (e: Throwable) {
            lastError = e.message ?: e.toString()
            shutdown()
            state = 3
        }
    }

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "MahyarVPN", NotificationManager.IMPORTANCE_LOW))
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (launch != null) PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE) else null
        @Suppress("DEPRECATION")
        val nb = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
        val n = nb
            .setContentTitle("MahyarVPN")
            .setContentText("Connected · وصل")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun shutdown() {
        if (tun != null) {
            try { TProxyService.TProxyStopService() } catch (_: Throwable) {}
            try { tun?.close() } catch (_: Throwable) {}
            tun = null
        }
        try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
    }

    /** کاربر VPN رو از تنظیمات اندروید قطع کرد یا یه VPN دیگه روشن شد */
    override fun onRevoke() {
        shutdown()
        state = 0
        stopSelf()
    }

    override fun onDestroy() {
        shutdown()
        if (state == 2) state = 0
        super.onDestroy()
    }
}
