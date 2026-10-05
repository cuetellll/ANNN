# MahyarVPN

کلاینت VPN **ویندوز و اندروید** با **sing-box 1.14**، رابط کاربری مدرن (انیمیشن و glow)، فارسی/انگلیسی، حالت **TUN** و **System Proxy**.

## امکانات
- پروتکل‌ها: VLESS (Reality / TLS / WS / gRPC / HTTPUpgrade)، VMess، Trojan، Shadowsocks، Hysteria2، TUIC
- دکمه **دریافت کانفیگ**: ساب‌اسکریپشن رو می‌گیره و لیست رو بروز می‌کنه (بدون آپدیت برنامه)
- **تست پینگ واقعی**: درخواست HTTP واقعی از داخل هر سرور (نه ICMP)
- **انتخاب خودکار**: بهترین پینگ وصل میشه؛ اگه وصل نشد، میره سراغ بعدی (تا ۳ سرور)
- یا خودت از لیست انتخاب کن (وسط اتصال هم سوییچ میشه)
- خروجی: **Setup.exe** (نصبی) و **Portable.zip**


## MahyarVPN 2.0 · رابط کاربری «Orbit» (از صفر بازطراحی شد)
- **کره‌ی زمین سه‌بعدی زنده**: سرورها روی نقشه با پالس نشون داده میشن؛ موقع اتصال یه کمان نورانی از موقعیت تو تا سرور کشیده میشه و پکت‌ها روش حرکت می‌کنن
- **دکمه‌ی اتصال جدید**: حلقه‌ی گرادیانی چرخان، حالت مغناطیسی (دنبال موس میاد)، موج شوک موقع وصل شدن، آیکن که از پاور به سپر تبدیل میشه
- **ناوبری کناری** با ۴ صفحه: داشبورد، سرورها، آمار، تنظیمات (در پنجره‌ی باریک، داک پایین)
- **پالت دستورات** با `Ctrl+K`: هر کاری یا هر سروری رو تایپ کن و Enter
- **صفحه‌ی آمار**: نمودار زنده‌ی ترافیک، بیشترین/میانگین سرعت، توزیع پینگ سرورها، سهم پروتکل‌ها
- **تنظیمات**: کارت‌های حالت TUN/Proxy، ۴ تم رنگی (بنفش نئونی، آبی یخی، زمردی، غروب)، زبان، کاهش انیمیشن
- اتصال مستقیم به سریع‌ترین سرور، دابل‌کلیک روی هر سرور = اتصال، علاقه‌مندی‌ها، فیلتر پروتکل
- مجموعه آیکن اختصاصی duotone، افکت نور زیر موس روی کارت‌ها، شمارنده‌ی عددی انیمیشنی، اسپلش‌اسکرین
- میانبرها: `Ctrl+K` پالت · `Ctrl+Enter` اتصال · `F5` کانفیگ · `Ctrl+T` پینگ · `Ctrl+F` جستجو · `Ctrl+1..4` صفحه‌ها · `F11` تمام‌صفحه
- اندازه‌ی پیش‌فرض پنجره: 1080×700 (حداقل 420×640)

---

## ۱) ساخت ساب‌اسکریپشن (یک بار)
1. توی گیت‌هاب یه ریپوی **Public** جدید بساز به اسم دقیقاً `mahyarvpn-sub`
2. یه فایل `sub.txt` توش بساز و کانفیگ‌هات رو بذار، **هر خط یه لینک** (نمونه: `sub-repo-example/sub.txt`)
   - اگه لینک ساب از پنل (مثل Marzban/3x-ui/Hiddify) داری، محتوای base64 هم قبوله
3. تمام. برنامه خودش از این آدرس‌ها می‌خونه:
   - `https://raw.githubusercontent.com/<USERNAME>/mahyarvpn-sub/main/sub.txt`
   - میرور (اگه raw فیلتر بود): `https://cdn.jsdelivr.net/gh/<USERNAME>/mahyarvpn-sub@main/sub.txt`

`<USERNAME>` موقع بیلد خودکار از اسم اکانت گیت‌هابت پر میشه، لازم نیست کد رو دست بزنی.

**هر وقت خواستی کانفیگ‌ها رو عوض کنی:** فقط `sub.txt` رو ادیت و Commit کن. کاربر دکمه «دریافت کانفیگ» رو می‌زنه و بروز میشه.
> jsDelivr تا ۱۲ ساعت کش می‌کنه؛ برای پاک کردن فوری کش این آدرس رو باز کن:
> `https://purge.jsdelivr.net/gh/<USERNAME>/mahyarvpn-sub@main/sub.txt`

**لینک دلخواه (اختیاری):** اگه ساب پنل خودت یا Cloudflare Worker داری، توی ریپوی برنامه برو به
`Settings → Secrets and variables → Actions → Variables` و متغیر `SUB_URL` بساز. اون اولویت اول میشه.

> ⚠️ ریپوی Public یعنی هر کی آدرس رو داشته باشه کانفیگ‌ها رو می‌بینه. اگه مهمه، از ساب پنل خودت (SUB_URL) استفاده کن.

## ۲) گرفتن EXE از GitHub Actions
1. این پروژه رو توی یه ریپو (مثلاً `mahyarvpn`) Push کن
2. تب **Actions** → `Build MahyarVPN` → **Run workflow**
3. بعد از ~۱۰ دقیقه، پایین صفحه‌ی همون Run بخش **Artifacts** → `MahyarVPN-Windows` (Setup + Portable)

برای ریلیز رسمی تگ بزن:
```bash
git tag v1.0.0 && git push origin v1.0.0
```
فایل‌ها توی تب **Releases** قرار می‌گیرن.

sing-box نسخه 1.14 خودکار از ریلیز رسمی SagerNet دانلود و کنار برنامه بسته‌بندی میشه.

## ۳) اجرای لوکال (اختیاری)
پیش‌نیاز: Node 20، Rust، WebView2
```bash
# sing-box.exe خودت رو بذار اینجا: src-tauri/bin/sing-box.exe
npm install
npm run tauri dev
```

## نکات
- **TUN** کل سیستم رو تونل می‌کنه و دسترسی Administrator می‌خواد (برنامه خودش پیشنهاد اجرای دوباره با ادمین رو میده)
- **Proxy** پروکسی ویندوز رو روی `127.0.0.1:12334` تنظیم می‌کنه (HTTP + SOCKS) و موقع خروج خودکار برش می‌گردونه
- xhttp / splithttp توسط sing-box پشتیبانی نمیشن و رد میشن
- لاگ‌ها: `%APPDATA%\com.mahyar.vpn\core.log`

## تغییرات نسخه 1.1
- Maximize و فول‌اسکرین (F11) با چیدمان دوستونه در صفحه‌ی بزرگ
- سرعت لحظه‌ای دانلود/آپلود، مصرف کل و نمایش IP و کشور خروجی (چک واقعی اینترنت بعد از اتصال)
- نمایش کد کشور به‌جای ایموجی پرچم (ویندوز پرچم نشون نمیده)
- جستجو و مرتب‌سازی سرورها بر اساس پینگ، نوار کیفیت پینگ، انیمیشن‌های بیشتر

## v2.1 changes
- Home: connect button moved to the center under the globe (bigger, with a label), status and timer centered under it.
- Globe: real continents (Natural Earth land mask, `src/land.ts`), orbit ring now goes behind the planet, thinner atmosphere, background stars, calmer background.
- System tray: minimize / X hides to tray. Left-click the tray icon = open, right-click = connect/disconnect, open, quit. The icon gets a green dot when connected. Full exit: tray menu > Quit.

## v2.2 changes
- New connect icon: power glyph draws in, spins while connecting, morphs to a shield + check when connected.
- Animated wavy MAHYARVPN title at the top of the dashboard (VPN part turns green when connected).
- Single instance (tauri-plugin-single-instance): launching again just brings the window back.
- Start with Windows (tauri-plugin-autostart, starts hidden in tray) + Auto-connect toggle in Settings.
- Windows notification on connect/disconnect while hidden in tray (tauri-plugin-notification).
- Empty-state card on the dashboard when there are no configs; duplicate status chip removed.

## v2.3 · اسکن هوشمند ساب‌های عمومی
- **ساب عمومی** (پیش‌فرض: `4n0nymou3/multi-proxy-config-fetcher`، با میرور jsDelivr) کنار ساب شخصی خودت
- همه‌ی کانفیگ‌های ساب عمومی نمیاد تو برنامه: با **اینترنت خود کاربر** تست میشن و فقط **۱۰ تای کم‌پینگ** نگه داشته میشه (۵/۱۰/۱۵/۲۰ از تنظیمات)
- اسکن دو مرحله‌ای:
  1. اتصال TCP موازی به همه (۱۲۸ تا همزمان) → مرده‌ها و فیلترشده‌ها حذف
  2. تست HTTP واقعی از داخل تونل (sing-box) روی بهترین‌ها، با تنوع (حداکثر ۳ کانفیگ از یه سرور)
- کانفیگ‌هایی که قطعاً خرابن (UUID غلط، رمز ss ناشناخته، reality بدون کلید) همون اول کنار میرن؛ اگه یه کانفیگ خراب کل یه دسته رو رد کنه، دسته نصف میشه تا فقط همون حذف بشه
- اگه وسط اتصال TUN اسکن کنی، تونل موقتاً قطع میشه که تست با نت واقعی باشه و بعد خودش دوباره وصل میشه
- **ساب دلخواه**: از تنظیمات لینک ساب اضافه کن، روشن/خاموش کن
- **اسکن دوباره** (`Ctrl+R`): بدون دانلود مجدد، از همون استخر قبلی دوباره سریع‌ترین‌ها رو پیدا می‌کنه
- UI: پنل زنده‌ی اسکن (قیف دریافت ← زنده ← تست واقعی ← برترین‌ها)، رتبه‌ی طلایی/نقره‌ای/برنزی روی کارت سرورها، پیل رنگی پینگ، گروه ابزار با tooltip، سه‌تا سریع‌ترین روی داشبورد برای اتصال یه‌کلیکی، فیلتر «برترین‌ها / شخصی»
- علاقه‌مندی‌ها از ساب عمومی بعد از اسکن دوباره حذف نمیشن

## v2.4 · داشبورد در دسترس‌تر
- **دکمه‌ی بزرگ «دریافت کانفیگ»** همیشه بالای داشبورد، با چراغ تازگی (سبز: کمتر از ۱ ساعت، زرد: چند ساعت، قرمز: قدیمی) و تعداد کانفیگ‌ها
- سه دکمه‌ی سریع با برچسب: **اسکن دوباره**، **تست پینگ**، **افزودن کانفیگ**
- **افزودن کانفیگ دستی** (`Ctrl+I`): لینک یا ساب base64 رو بچسبون؛ با «دریافت کانفیگ» بعدی پاک نمیشن (پاک کردن از تنظیمات)
- **کپی کانفیگ** سرور فعلی از کارت سرور
- **انتخاب حالت TUN/Proxy** با دو کارت بزرگ روی داشبورد (وقتی وصل نیستی)؛ کارت‌های سرعت و IP فقط موقع اتصال نشون داده میشن
- **بررسی نسخه‌ی جدید**: خودکار موقع باز شدن + دکمه در تنظیمات؛ اگه ریلیز جدید باشه، دکمه‌ی دانلود صفحه‌ی ریلیز رو باز می‌کنه
- اعلان‌ها (toast) رفتن بالا وسط و دیگه روی دکمه‌ها نمی‌افتن

## v2.5 · مدل اتصال ۲ (Aether) داخل خود برنامه
- **انتخاب مدل اتصال** زیر دکمه‌ی اتصال روی داشبورد (و توی تنظیمات و پالت `Ctrl+K`):
  - **مدل ۱ · V2Ray**: همون قبلی، کانفیگ‌های ساب + sing-box
  - **مدل ۲ · Aether**: پروژه‌ی [CluvexStudio/Aether](https://github.com/CluvexStudio/Aether)، تونل WARP (MASQUE / WireGuard / Gool) با پیدا کردن خودکار گیت‌وی
- دیگه لازم نیست دستی V2Ray رو به `127.0.0.1:1819` وصل کنی: برنامه خودش `aether.exe` رو پشت صحنه و بدون پنجره اجرا می‌کنه، صبر می‌کنه تا گیت‌وی سالم پیدا بشه، بعد sing-box جلوش **TUN** (کل سیستم) یا **Proxy** (پروکسی ویندوز) رو راه می‌ندازه
- ترافیک و DNS خود aether.exe توی حالت TUN مستقیم میره بیرون (حلقه درست نمیشه)
- وقتی مدل ۲ انتخاب شده، داشبورد خلوت میشه: فقط دکمه‌ی اتصال، انتخاب مدل و انتخاب روش اتصال (TUN/Proxy)
- حین اسکن Aether، لاگ زنده و ثانیه‌شمار زیر دکمه نشون داده میشه؛ زدن دوباره‌ی دکمه = لغو
- تنظیمات مدل ۲: پروتکل (MASQUE / WireGuard / Gool)، نوع اسکن (سریع / متعادل / دقیق / مطمئن)، MASQUE روی HTTP/2
- هویت WARP و آخرین گیت‌وی سالم توی `%APPDATA%\com.mahyar.vpn\aether\` می‌مونه (اتصال‌های بعدی سریع‌تره)؛ لاگ: `aether\aether.log`
- **آیکون جدید برنامه** (سپر با مدار)، لوگوی جدید داخل برنامه و اسپلش، آیکون‌های مدل ۱/۲، دو تم رنگی جدید: **شفق** و **رز**
- CI خودش Aether v1.5.0 رو از ریلیز رسمی دانلود می‌کنه (با چک SHA256) و کنار برنامه می‌ذاره. برای نسخه‌ی دیگه، متغیر `AETHER_TAG` رو توی Variables ریپو بساز (مثلاً `latest`)

**اجرای لوکال:** `aether.exe` رو از `aether-windows-x86_64.zip` بذار توی `src-tauri/bin/aether/`.

## v2.6 · نسخه‌ی اندروید 📱
همون برنامه (همون رابط کاربری، ساب‌ها، اسکن هوشمند، مدل ۱ و ۲) حالا روی اندروید هم هست. هر دو نسخه با **یه بار Run workflow** ساخته میشن.

**گرفتن APK:** تب **Actions** → `Build MahyarVPN` → **Run workflow** → بعد از ~۲۰ دقیقه توی **Artifacts**:
- `MahyarVPN-Android` → `MahyarVPN-android-arm64.apk` (اکثر گوشی‌ها) و `MahyarVPN-android-armv7.apk` (گوشی‌های قدیمی ۳۲ بیتی)
- اگه تگ بزنی (`v2.6.0`)، APKها کنار Setup.exe توی **Releases** هم قرار می‌گیرن

**کلید امضا (یه بار، مهم):** اندروید فقط وقتی آپدیت رو روی نسخه‌ی قبلی نصب می‌کنه که با همون کلید امضا شده باشه.
1. اولین بیلد، چون Secret نداری، یه کلید جدید می‌سازه و یه Artifact به اسم `android-keystore` میده
2. دانلودش کن؛ محتوای `ANDROID_KEYSTORE_B64.txt` رو توی `Settings → Secrets and variables → Actions → Secrets` با اسم `ANDROID_KEYSTORE_B64` بذار
3. دو Secret دیگه هم بساز: `ANDROID_KEYSTORE_PASSWORD` = `mahyarvpn` و `ANDROID_KEY_ALIAS` = `mahyarvpn`
4. از این به بعد همه‌ی APKها با همین کلید امضا میشن. فایل keystore رو یه جای امن نگه دار

**چطوری کار می‌کنه:**
- **TUN** = VPN کل گوشی با `VpnService` اندروید (بدون روت). ترافیک برنامه‌ها ← `hev-socks5-tunnel` ← sing-box ← سرور
- **Proxy** = فقط پروکسی محلی `127.0.0.1:12334` (HTTP + SOCKS) بدون VPN، برای برنامه‌هایی که خودشون پروکسی می‌گیرن
- خود MahyarVPN از VPN مستثناست، پس sing-box و Aether مستقیم وصل میشن، و **تست پینگ/اسکن وسط اتصال دیگه تونل رو قطع نمی‌کنه**
- عوض کردن سرور وسط اتصال، VPN رو خاموش نمی‌کنه (نشتی نداره)
- اگه VPN رو از تنظیمات اندروید یا نوتیفیکیشن قطع کنی، برنامه هم قطع حساب می‌کنه
- sing-box 1.14 (`android-arm64` / `android-arm`) و Aether (`aether-android-*`، با چک SHA256) از ریلیز رسمیشون دانلود میشن؛ `hev-socks5-tunnel` با NDK بیلد میشه
- چیزهای مخصوص ویندوز توی اندروید مخفی‌ان: دکمه‌های پنجره، اجرا با ویندوز، tray، ادمین
- اولین اتصال TUN اندروید اجازه‌ی VPN می‌پرسه؛ قبول کن

**ساختار کد اندروید:**
- `src-tauri/src/lib.rs`: همه‌ی کد Rust (قبلاً main.rs)؛ بخش‌های ویندوزی با `#[cfg(desktop)]` جدا شدن، رفتار ویندوز عوض نشده
- `src-tauri/src/android.rs`: اجرای sing-box از داخل APK، تطبیق کانفیگ (حذف اینباند tun، DNS شبکه‌ی گوشی به‌جای local)، روشن/خاموش کردن VPN
- `src-tauri/mvpn-plugin/`: پلاگین Tauri با کد Kotlin (`VpnPlugin.kt`، `MvpnService.kt`، `TProxyService.kt`)
- `src-tauri/tauri.android.conf.json`: تنظیمات مخصوص اندروید
- `src/platform.ts`: تشخیص اندروید توی UI

**بیلد لوکال اندروید (اختیاری):** Android Studio + NDK، بعد فایل‌ها رو مثل workflow توی `src-tauri/mvpn-plugin/android/src/main/jniLibs/<abi>/` بذار (`libsingbox.so`، `libaether.so`، `libhev-socks5-tunnel.so`) و:
```bash
npm install
npx tauri android init
npx tauri android dev
```
