import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Lang } from "./types";

const ar = {
  app_name: "IELTS Pilot",
  nav_home: "الرئيسية",
  nav_settings: "الإعدادات",

  boot_starting: "بيجهّز البرنامج…",
  boot_slow: "أول تشغيل بعد التسطيب ممكن ياخد لحد 15 ثانية.",
  boot_failed_title: "الخدمة المحلية ما اشتغلتش",
  boot_failed_hint: "بياناتك في أمان. جرّب تاني، ولو المشكلة فضلت افتح فولدر البيانات وابعت فولدر logs.",
  retry: "جرّب تاني",
  open_data_folder: "افتح فولدر البيانات",

  step_of: "خطوة {n} من {total}",
  back: "رجوع",
  next: "التالي",
  finish: "احفظ وابدأ",
  save: "احفظ",
  saving: "بيحفظ…",
  saved: "اتحفظ ✓",
  cancel: "إلغاء",
  not_set: "مش متحدد",
  optional: "اختياري",

  welcome_title: "أهلًا بيك في IELTS Pilot",
  welcome_body: "البرنامج بيقولك تذاكر إيه دلوقتي، وبيخليك تذاكر جواه، وبيوريك تقدمك الحقيقي.",
  welcome_local: "كل بياناتك بتتحفظ على الجهاز ده بس. مفيش حساب، ومش محتاج إنترنت.",
  field_language: "لغة البرنامج",
  lang_ar: "العربي",
  lang_en: "English",
  field_name: "اسمك",

  goals_title: "هدفك",
  field_target_overall: "الدرجة الكلية المستهدفة",
  field_minimum: "أقل درجة مقبولة في أي مهارة",
  field_custom_targets: "عايز أحدد هدف مختلف لكل مهارة",
  field_exam_date: "ميعاد الامتحان",

  skill_listening: "الاستماع",
  skill_reading: "القراءة",
  skill_writing: "الكتابة",
  skill_speaking: "المحادثة",

  levels_title: "مستواك دلوقتي",
  levels_hint:
    "لو حليت اختبار تجريبي رسمي، دخّل درجته واسم الاختبار. لو مش متأكد، اختار «تقدير شخصي» أو سيبها «مش عارف» — البرنامج هيوضح دايمًا إن الرقم ده تقديرك.",
  level_unknown: "مش عارف",
  field_source: "مصدر الرقم",
  source_official_practice: "اختبار تجريبي رسمي",
  source_external_marker: "تقييم من مدرس أو مصحح",
  source_self_estimate: "تقدير شخصي",
  field_source_note: "اسم الاختبار أو المصدر",

  time_title: "وقت المذاكرة",
  field_days: "كام يوم في الأسبوع؟",
  field_minutes: "كام دقيقة في اليوم؟",
  field_explanation: "لغة الشرح",
  expl_ar_heavy: "عربي أكتر",
  expl_balanced: "نص ونص",
  expl_en_heavy: "انقلني للإنجليزي بسرعة",

  review_title: "راجع واحفظ",
  weekly_minutes: "{m} دقيقة في الأسبوع",

  err_target_below_min: "الهدف أقل من أقل درجة مقبولة ({min})",
  err_exam_past: "الميعاد ده فات",
  err_note_required: "اكتب اسم الاختبار أو المصدر",
  err_no_levels: "اختار درجة لمهارة واحدة على الأقل",
  err_generic: "حصلت مشكلة: {msg}",

  home_hello: "أهلًا {name}",
  home_hello_anon: "أهلًا",
  home_targets: "أهدافك",
  home_overall: "الكلي",
  home_minimum: "أقل درجة مقبولة: {min}",
  home_levels: "مستواك الحالي",
  home_gap: "فاضل",
  home_reached: "وصلت",
  home_exam: "الامتحان",
  home_days_left: "فاضل {n} يوم",
  home_exam_today: "النهارده!",
  home_no_exam: "مفيش ميعاد محدد",
  home_week: "وقتك في الأسبوع",
  home_week_detail: "{d} أيام × {m} دقيقة",
  home_self_tag: "تقديرك",
  home_low_confidence:
    "في أرقام هنا تقديرك الشخصي أو ناقصة. أول اختبار تجريبي رسمي هيخلّيها أدق — سجّله من الإعدادات.",
  home_next_title: "جاي في Sprint 2",
  home_next_body:
    "شاشة «النهارده»: مهمة واحدة كل مرة، ومعاها سبب اختيارها. دلوقتي تقدر تراجع أهدافك ومستواك هنا وتعدّلهم من الإعدادات.",
  edit_in_settings: "عدّل من الإعدادات",

  settings_title: "الإعدادات",
  tab_profile: "الأهداف والوقت",
  tab_levels: "المستوى",
  tab_data: "البيانات والنسخ",
  levels_current: "المستوى الحالي",
  levels_add: "سجّل مستوى جديد",
  levels_add_hint: "اختار المهارات اللي عندك ليها رقم جديد بس. القديم بيفضل في السجل.",
  levels_history: "السجل",
  levels_added: "اتسجل ✓",
  levels_empty: "لسه مفيش مستوى متسجل.",

  data_where: "مكان بياناتك",
  data_free: "المساحة الفاضية على الديسك",
  data_low_disk:
    "المساحة الفاضية أقل من 500 ميجا — النسخ الاحتياطي هيترفض لحد ما تفضّي مساحة.",
  version_info: "الإصدار {v} · قاعدة البيانات {r}",
  backups_title: "النسخ الاحتياطية",
  backups_hint:
    "النسخة ملف واحد فيه كل بياناتك. احتفظ بنسخة برّه الجهاز (فلاشة أو Drive) — ده الضمان الحقيقي لو الجهاز حصله حاجة.",
  backup_now: "اعمل نسخة دلوقتي",
  backup_import: "استرجع من ملف…",
  backup_open_folder: "افتح فولدر النسخ",
  backups_empty: "لسه مفيش نسخ.",
  backup_restore: "استرجع",
  backup_export: "احفظ نسخة برّه…",
  backup_delete: "امسح",
  backup_kind_manual: "يدوي",
  backup_kind_pre_migration: "تلقائي قبل تحديث",
  backup_kind_pre_restore: "تلقائي قبل استرجاع",
  backup_kind_pre_delete: "تلقائي قبل مسح",
  backup_kind_imported: "مستورد",
  backup_invalid: "ملف مش سليم",
  backup_created: "اتعملت نسخة ✓",
  confirm_restore:
    "بياناتك هترجع لحالتها في النسخة دي. هعمل نسخة أمان من حالتك الحالية الأول. أكمّل؟",
  restored_ok: "اتسترجعت ✓ — نسخة الأمان: {name}",
  confirm_delete_backup: "تمسح النسخة دي نهائيًا؟",
  exported_ok: "اتحفظت برّه ✓",
  imported_ok: "اتضافت للقايمة ✓ — اضغط «استرجع» جنبها لو عايز ترجع لها.",

  danger_title: "مسح كل البيانات",
  danger_body:
    "هيمسح ملفك وأهدافك ومستواك وكل حاجة اتسجلت. هعمل نسخة أمان الأول، عشان لو غيرت رأيك تسترجعها.",
  danger_type: "اكتب «{word}» للتأكيد",
  danger_word: "امسح",
  danger_button: "امسح كل حاجة",
  bridge_missing: "الخاصية دي شغالة جوه البرنامج بس.",
};

type Key = keyof typeof ar;

const en: Record<Key, string> = {
  app_name: "IELTS Pilot",
  nav_home: "Home",
  nav_settings: "Settings",

  boot_starting: "Getting ready…",
  boot_slow: "The first launch after installing can take up to 15 seconds.",
  boot_failed_title: "The local service did not start",
  boot_failed_hint:
    "Your data is safe. Try again; if it keeps failing, open the data folder and send the logs folder.",
  retry: "Try again",
  open_data_folder: "Open data folder",

  step_of: "Step {n} of {total}",
  back: "Back",
  next: "Next",
  finish: "Save and start",
  save: "Save",
  saving: "Saving…",
  saved: "Saved ✓",
  cancel: "Cancel",
  not_set: "Not set",
  optional: "optional",

  welcome_title: "Welcome to IELTS Pilot",
  welcome_body:
    "It tells you what to study now, lets you study inside it, and shows your real progress.",
  welcome_local: "All your data stays on this computer. No account, no internet needed.",
  field_language: "App language",
  lang_ar: "العربي",
  lang_en: "English",
  field_name: "Your name",

  goals_title: "Your goal",
  field_target_overall: "Target overall band",
  field_minimum: "Minimum acceptable band in any skill",
  field_custom_targets: "Set a different target for each skill",
  field_exam_date: "Exam date",

  skill_listening: "Listening",
  skill_reading: "Reading",
  skill_writing: "Writing",
  skill_speaking: "Speaking",

  levels_title: "Your level now",
  levels_hint:
    "If you took an official practice test, enter its score and name. If unsure, choose “Self-estimate” or leave “Don't know” — the app always labels these as your estimate.",
  level_unknown: "Don't know",
  field_source: "Where the number comes from",
  source_official_practice: "Official practice test",
  source_external_marker: "Teacher or marker",
  source_self_estimate: "Self-estimate",
  field_source_note: "Test name or source",

  time_title: "Study time",
  field_days: "Days per week",
  field_minutes: "Minutes per day",
  field_explanation: "Explanation language",
  expl_ar_heavy: "More Arabic",
  expl_balanced: "Balanced",
  expl_en_heavy: "Move me to English fast",

  review_title: "Review and save",
  weekly_minutes: "{m} minutes per week",

  err_target_below_min: "Target is below the minimum acceptable band ({min})",
  err_exam_past: "That date has passed",
  err_note_required: "Enter the test name or source",
  err_no_levels: "Choose a band for at least one skill",
  err_generic: "Something went wrong: {msg}",

  home_hello: "Hello {name}",
  home_hello_anon: "Hello",
  home_targets: "Your targets",
  home_overall: "Overall",
  home_minimum: "Minimum acceptable: {min}",
  home_levels: "Your current level",
  home_gap: "to go",
  home_reached: "reached",
  home_exam: "Exam",
  home_days_left: "{n} days left",
  home_exam_today: "Today!",
  home_no_exam: "No date set",
  home_week: "Your study time per week",
  home_week_detail: "{d} days × {m} minutes",
  home_self_tag: "your estimate",
  home_low_confidence:
    "Some numbers here are self-estimates or missing. Your first official practice test will make them more accurate — record it in Settings.",
  home_next_title: "Coming in Sprint 2",
  home_next_body:
    "The “Today” screen: one task at a time, with the reason it was chosen. For now you can review your goals and level here and edit them in Settings.",
  edit_in_settings: "Edit in Settings",

  settings_title: "Settings",
  tab_profile: "Goals and time",
  tab_levels: "Level",
  tab_data: "Data and backups",
  levels_current: "Current level",
  levels_add: "Record a new level",
  levels_add_hint: "Choose only the skills you have a new number for. Older entries stay in the history.",
  levels_history: "History",
  levels_added: "Recorded ✓",
  levels_empty: "No level recorded yet.",

  data_where: "Where your data lives",
  data_free: "Free disk space",
  data_low_disk: "Less than 500 MB free — backups are refused until you free some space.",
  version_info: "Version {v} · database {r}",
  backups_title: "Backups",
  backups_hint:
    "A backup is one file with all your data. Keep a copy off this computer (USB stick or Drive) — that is the real protection.",
  backup_now: "Back up now",
  backup_import: "Restore from a file…",
  backup_open_folder: "Open backups folder",
  backups_empty: "No backups yet.",
  backup_restore: "Restore",
  backup_export: "Save a copy elsewhere…",
  backup_delete: "Delete",
  backup_kind_manual: "Manual",
  backup_kind_pre_migration: "Auto, before update",
  backup_kind_pre_restore: "Auto, before restore",
  backup_kind_pre_delete: "Auto, before delete",
  backup_kind_imported: "Imported",
  backup_invalid: "Damaged file",
  backup_created: "Backup created ✓",
  confirm_restore:
    "Your data will return to the state in this backup. A safety backup of the current state is made first. Continue?",
  restored_ok: "Restored ✓ — safety backup: {name}",
  confirm_delete_backup: "Delete this backup permanently?",
  exported_ok: "Copy saved ✓",
  imported_ok: "Added to the list ✓ — press “Restore” next to it to go back to it.",

  danger_title: "Delete all data",
  danger_body:
    "Deletes your profile, goals, levels and everything recorded. A safety backup is made first, so you can restore it if you change your mind.",
  danger_type: "Type “{word}” to confirm",
  danger_word: "DELETE",
  danger_button: "Delete everything",
  bridge_missing: "This works inside the app only.",
};

const DICTS: Record<Lang, Record<Key, string>> = { ar, en };

export type T = (key: Key, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  t: T;
  formatDate: (iso: string | null) => string;
  formatBand: (band: number | null | undefined) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const dict = DICTS[lang];
    const dateFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
      dateStyle: "medium",
    });
    return {
      lang,
      t: (key, vars) =>
        dict[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`)),
      formatDate: (iso) => (iso ? dateFmt.format(new Date(iso)) : "—"),
      formatBand: (band) => (band === null || band === undefined ? "—" : band.toFixed(1)),
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
