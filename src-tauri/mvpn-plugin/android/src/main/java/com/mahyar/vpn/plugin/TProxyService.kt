package com.mahyar.vpn.plugin

/**
 * hev-socks5-tunnel (JNI). کتابخونه با PKGNAME=com/mahyar/vpn/plugin بیلد میشه
 * و خودش این متدها رو روی همین کلاس ثبت می‌کنه.
 */
object TProxyService {
    init {
        System.loadLibrary("hev-socks5-tunnel")
    }

    @JvmStatic
    external fun TProxyStartService(configPath: String, fd: Int)

    @JvmStatic
    external fun TProxyStopService()

    @JvmStatic
    external fun TProxyGetStats(): LongArray?
}
