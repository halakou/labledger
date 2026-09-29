// Minimal i18n layer for the desk's chrome — nav, hero, section headings,
// FAQ. The board's content stays English because it is filed from
// English-language official sources; translation covers the parts a reader
// navigates. Missing keys fall back to English, so a partial translation
// never renders an empty label.
//
// Wiring: shell() takes `lang` (html lang/dir + hreflang alternates), and the
// page builders take a `t` function for their own strings. Adding a language
// means adding one object below plus one route in pages.mjs.

export const STRINGS = {
  en: {
    nav_today: "Today",
    nav_week: "Week",
    nav_guide: "Guide",
    nav_method: "Method",
    nav_support: "Support",
    nav_channel: "Channel",
    skip: "Skip to the board",
    hero_h1: "What the labs moved. Sourced, dated, kept.",
    hero_p:
      "Every brief starts at the source — an official feed or release page from a named lab, read directly and dated. Nothing is rewritten from a rumor, nothing is invented, and the primary link sits on every page.",
    meta_desk_date: "Desk date",
    meta_open_briefs: "Open briefs",
    meta_ledger: "Ledger",
    search_label: "Look up a lab, a launch, or a topic",
    search_placeholder: "Anthropic, hardware, Claude…",
    board_head: "The board",
    board_logged: "logged",
    open_head: "Open releases",
    open_filed: "filed",
    method_link: "How the desk works",
    method_kicker: "Method",
    method_h1: "How the desk works",
    faq_what_h: "What does the desk file?",
    faq_what_p:
      "Official announcements from named labs and research groups — plus the open-source releases that move the stack underneath them. One brief per move, about 100 words. The primary source stays on the page.",
    faq_sources_h: "Which sources are on the board?",
    faq_sources_p:
      "Every source below is read straight from the publisher's own feed or release page. No wire service, no aggregator, no screenshot.",
    faq_invent_h: "Does the desk invent launches?",
    faq_invent_p:
      "No. It reads allow-listed official sources, fills a fixed template, and mirrors the same brief to {tg} after the page exists. There is no email list — use RSS or the weekly digest.",
    lang_switch: "فارسی",
    lang_switch_href: "/fa/",
  },
  fa: {
    nav_today: "امروز",
    nav_week: "هفته",
    nav_guide: "راهنما",
    nav_method: "روش کار",
    nav_support: "حمایت",
    nav_channel: "کانال",
    skip: "پرش به تابلو",
    hero_h1: "آنچه آزمایشگاه‌ها حرکت دادند. مستند، تاریخ‌دار، نگه‌داشته.",
    hero_p:
      "هر خبر از همان سرچشمه شروع می‌شود — یک خوراک یا صفحهٔ رسمی از یک آزمایشگاه نام‌دار، که مستقیم خوانده و تاریخ‌گذاری می‌شود. هیچ چیز از شایعه بازنویسی نمی‌شود، چیزی اختراع نمی‌شود، و پیوند اصلی در هر صفحه هست.",
    meta_desk_date: "تاریخ میز",
    meta_open_briefs: "خبرهای باز",
    meta_ledger: "دفتر",
    search_label: "جستجوی یک آزمایشگاه، یک رویداد، یا یک موضوع",
    search_placeholder: "Anthropic، سخت‌افزار، Claude…",
    board_head: "تابلو",
    board_logged: "ثبت‌شده",
    open_head: "انتشارهای باز",
    open_filed: "ثبت‌شده",
    method_link: "روش کار میز",
    method_kicker: "روش کار",
    method_h1: "میز چطور کار می‌کند",
    faq_what_h: "میز چه چیزی ثبت می‌کند؟",
    faq_what_p:
      "اعلامیه‌های رسمی از آزمایشگاه‌ها و گروه‌های پژوهشی نام‌دار — به‌اضافهٔ انتشارهای متن‌بازی که زیربنای آن‌ها را حرکت می‌دهند. یک خبر برای هر حرکت، حدود ۱۰۰ کلمه. سرچشمهٔ اصلی در صفحه می‌ماند.",
    faq_sources_h: "کدام سرچشمه‌ها روی تابلو هستند؟",
    faq_sources_p:
      "هر سرچشمهٔ زیر مستقیم از خوراک یا صفحهٔ انتشار خود ناشر خوانده می‌شود. بدون خبرگزاری، بدون جمع‌آورنده، بدون اسکرین‌شات.",
    faq_invent_h: "آیا میز رویدادها را اختراع می‌کند؟",
    faq_invent_p:
      "نه. سرچشمه‌های رسمی مجاز را می‌خواند، یک قالب ثابت را پر می‌کند، و همان خبر را پس از وجود صفحه در {tg} آینه می‌کند. لیست ایمیلی وجود ندارد — از RSS یا هضم هفتگی استفاده کنید.",
    lang_switch: "English",
    lang_switch_href: "/",
  },
};

export const DEFAULT_LANG = "en";

export function t(lang, key) {
  const dict = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  return dict[key] || STRINGS[DEFAULT_LANG][key] || key;
}

export function dictFor(lang) {
  return STRINGS[lang] || STRINGS[DEFAULT_LANG];
}
