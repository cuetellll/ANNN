/** اندروید: همون رابط کاربری، فقط چیزهای مخصوص ویندوز (دکمه‌های پنجره، ادمین، اجرا با ویندوز) مخفی میشن */
export const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
if (IS_ANDROID && typeof document !== 'undefined') document.documentElement.classList.add('android');
