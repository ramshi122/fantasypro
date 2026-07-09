/**
 * i18n — Multi-language support
 * =============================
 * Languages: English, Hindi, Tamil, Telugu, Malayalam
 * localStorage "apna-cricket-lang"
 *
 * Usage:
 *   import { t, setLanguage, getLanguage } from "@/lib/i18n";
 *   const text = t("home.title");
 */

export type Language = "en" | "hi" | "ta" | "te" | "ml";

export const LANGUAGES: Array<{ code: Language; label: string; native: string }> = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
];

const KEY = "apna-cricket-lang";

// Translation dictionary — keyed by language code, then string key.
type Dict = Record<string, string>;
const translations: Record<Language, Dict> = {
  en: {
    "app.name": "Apna Cricket",
    "app.tagline": "AI Fantasy Team Generator",
    "nav.home": "Home",
    "nav.matches": "Matches",
    "nav.myTeams": "My Teams",
    "nav.research": "Research",
    "nav.profile": "Profile",
    "nav.admin": "Admin",
    "home.generateTeams": "Generate Teams",
    "home.autoGenerate": "Auto Generate",
    "home.bulkTransfer": "Bulk Transfer",
    "home.savedMatches": "Saved Matches",
    "home.liveMatches": "Live Matches",
    "home.upcomingMatches": "Upcoming Matches",
    "match.selectPlayers": "Select Players",
    "match.captain": "Captain",
    "match.viceCaptain": "Vice Captain",
    "match.credits": "Credits",
    "match.creditsLeft": "Credits Left",
    "match.teamSaved": "Team saved successfully",
    "match.teamDeleted": "Team deleted",
    "match.transferTo": "Transfer to",
    "match.lineupAnnounced": "Lineup Announced",
    "match.lineupPending": "Lineup Pending",
    "match.riskMeter": "Risk Meter",
    "match.captainPick": "Captain Pick",
    "profile.subscription": "Subscription",
    "profile.settings": "Settings",
    "profile.logout": "Logout",
    "profile.theme": "Theme",
    "profile.language": "Language",
    "profile.notifications": "Notifications",
    "profile.helpSupport": "Help & Support",
    "profile.privacySecurity": "Privacy & Security",
    "profile.referralCode": "Referral Code",
    "profile.shareApp": "Share App",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.confirm": "Confirm",
    "common.loading": "Loading...",
    "common.error": "Something went wrong",
    "common.retry": "Retry",
    "common.success": "Success",
    "common.failed": "Failed",
    "payment.upgrade": "Upgrade Plan",
    "payment.trial": "Trial",
    "payment.monthly": "Monthly",
    "payment.elite": "Elite",
    "payment.lifetime": "Lifetime",
    "analytics.totalUsers": "Total Users",
    "analytics.revenue": "Revenue",
    "analytics.teamsGenerated": "Teams Generated",
  },
  hi: {
    "app.name": "अपना क्रिकेट",
    "app.tagline": "AI फैंटेसी टीम जनरेटर",
    "nav.home": "होम",
    "nav.matches": "मैच",
    "nav.myTeams": "मेरी टीमें",
    "nav.research": "रिसर्च",
    "nav.profile": "प्रोफाइल",
    "nav.admin": "एडमिन",
    "home.generateTeams": "टीम बनाएं",
    "home.autoGenerate": "ऑटो जनरेट",
    "home.bulkTransfer": "बल्क ट्रांसफर",
    "home.savedMatches": "सेव किए गए मैच",
    "home.liveMatches": "लाइव मैच",
    "home.upcomingMatches": "आगामी मैच",
    "match.selectPlayers": "खिलाड़ी चुनें",
    "match.captain": "कप्तान",
    "match.viceCaptain": "उप-कप्तान",
    "match.credits": "क्रेडिट्स",
    "match.creditsLeft": "शेष क्रेडिट्स",
    "match.teamSaved": "टीम सेव हो गई",
    "match.teamDeleted": "टीम हटा दी गई",
    "match.transferTo": "ट्रांसफर करें",
    "match.lineupAnnounced": "लाइनअप घोषित",
    "match.lineupPending": "लाइनअप लंबित",
    "match.riskMeter": "रिस्क मीटर",
    "match.captainPick": "कप्तान चुनाव",
    "profile.subscription": "सब्सक्रिप्शन",
    "profile.settings": "सेटिंग्स",
    "profile.logout": "लॉगआउट",
    "profile.theme": "थीम",
    "profile.language": "भाषा",
    "profile.notifications": "नोटिफिकेशन",
    "profile.helpSupport": "सहायता",
    "profile.privacySecurity": "प्राइवेसी",
    "profile.referralCode": "रेफरल कोड",
    "profile.shareApp": "ऐप शेयर करें",
    "common.save": "सेव करें",
    "common.cancel": "रद्द करें",
    "common.delete": "हटाएं",
    "common.edit": "एडिट",
    "common.confirm": "पुष्टि करें",
    "common.loading": "लोड हो रहा है...",
    "common.error": "कुछ गलत हुआ",
    "common.retry": "पुनः प्रयास करें",
    "common.success": "सफल",
    "common.failed": "विफल",
    "payment.upgrade": "प्लान अपग्रेड करें",
    "payment.trial": "ट्रायल",
    "payment.monthly": "मासिक",
    "payment.elite": "एलीट",
    "payment.lifetime": "लाइफटाइम",
    "analytics.totalUsers": "कुल यूजर",
    "analytics.revenue": "राजस्व",
    "analytics.teamsGenerated": "टीमें बनाई गईं",
  },
  ta: {
    "app.name": "அப்னா கிரிக்கெட்",
    "app.tagline": "AI கற்பனை அணி ஜெனரேட்டர்",
    "nav.home": "முகப்பு",
    "nav.matches": "போட்டிகள்",
    "nav.myTeams": "என் அணிகள்",
    "nav.research": "ஆராய்ச்சி",
    "nav.profile": "சுயவிவரம்",
    "nav.admin": "நிர்வாகம்",
    "home.generateTeams": "அணிகளை உருவாக்கு",
    "home.autoGenerate": "தானியங்கி",
    "home.bulkTransfer": "மொத்த பரிமாற்றம்",
    "home.savedMatches": "சேமித்த போட்டிகள்",
    "home.liveMatches": "நேரடி போட்டிகள்",
    "home.upcomingMatches": "வரவிருக்கும்",
    "match.selectPlayers": "வீரர்களைத் தேர்ந்தெடு",
    "match.captain": "தலைவர்",
    "match.viceCaptain": "துணைத் தலைவர்",
    "match.credits": "கிரெடிட்கள்",
    "match.creditsLeft": "மீதமுள்ள கிரெடிட்கள்",
    "match.teamSaved": "அணி சேமிக்கப்பட்டது",
    "match.teamDeleted": "அணி நீக்கப்பட்டது",
    "match.transferTo": "பரிமாற்றம்",
    "match.lineupAnnounced": "அணி அறிவிக்கப்பட்டது",
    "match.lineupPending": "அணி நிலுவையில்",
    "match.riskMeter": "ஆபத்து அளவு",
    "match.captainPick": "தலைவர் தேர்வு",
    "profile.subscription": "சந்தா",
    "profile.settings": "அமைப்புகள்",
    "profile.logout": "வெளியேறு",
    "profile.theme": "தீம்",
    "profile.language": "மொழி",
    "profile.notifications": "அறிவிப்புகள்",
    "profile.helpSupport": "உதவி",
    "profile.privacySecurity": "தனியுரிமை",
    "profile.referralCode": "பரிந்துரை குறியீடு",
    "profile.shareApp": "பகிர்",
    "common.save": "சேமி",
    "common.cancel": "ரத்து",
    "common.delete": "நீக்கு",
    "common.edit": "திருத்து",
    "common.confirm": "உறுதிப்படுத்து",
    "common.loading": "ஏற்றுகிறது...",
    "common.error": "ஏதோ தவறு",
    "common.retry": "மீண்டும் முயற்சி",
    "common.success": "வெற்றி",
    "common.failed": "தோல்வி",
    "payment.upgrade": "திட்டம் மேம்படுத்து",
    "payment.trial": "சோதனை",
    "payment.monthly": "மாதாந்திர",
    "payment.elite": "எலைட்",
    "payment.lifetime": "வாழ்நாள்",
    "analytics.totalUsers": "மொத்த பயனர்கள்",
    "analytics.revenue": "வருவாய்",
    "analytics.teamsGenerated": "உருவாக்கப்பட்ட அணிகள்",
  },
  te: {
    "app.name": "అప్నా క్రికెట్",
    "app.tagline": "AI ఫాంటసీ జట్టు జనరేటర్",
    "nav.home": "హోమ్",
    "nav.matches": "మ్యాచ్‌లు",
    "nav.myTeams": "నా జట్లు",
    "nav.research": "పరిశోధన",
    "nav.profile": "ప్రొఫైల్",
    "nav.admin": "అడ్మిన్",
    "home.generateTeams": "జట్లను సృష్టించు",
    "home.autoGenerate": "ఆటో జనరేట్",
    "home.bulkTransfer": "బల్క్ బదిలీ",
    "home.savedMatches": "సేవ్ చేసిన మ్యాచ్‌లు",
    "home.liveMatches": "ప్రత్యక్ష మ్యాచ్‌లు",
    "home.upcomingMatches": "రాబోయే మ్యాచ్‌లు",
    "match.selectPlayers": "ఆటగాళ్లను ఎంచుకోండి",
    "match.captain": "కెప్టెన్",
    "match.viceCaptain": "వైస్ కెప్టెన్",
    "match.credits": "క్రెడిట్లు",
    "match.creditsLeft": "మిగిలిన క్రెడిట్లు",
    "match.teamSaved": "జట్టు సేవ్ చేయబడింది",
    "match.teamDeleted": "జట్టు తొలగించబడింది",
    "match.transferTo": "బదిలీ",
    "match.lineupAnnounced": "జట్టు ప్రకటించబడింది",
    "match.lineupPending": "జట్టు పెండింగ్",
    "match.riskMeter": "రిస్క్ మీటర్",
    "match.captainPick": "కెప్టెన్ ఎంపిక",
    "profile.subscription": "సబ్‌స్క్రిప్షన్",
    "profile.settings": "సెట్టింగ్‌లు",
    "profile.logout": "లాగౌట్",
    "profile.theme": "థీమ్",
    "profile.language": "భాష",
    "profile.notifications": "నోటిఫికేషన్‌లు",
    "profile.helpSupport": "సహాయం",
    "profile.privacySecurity": "గోప్యత",
    "profile.referralCode": "రెఫరల్ కోడ్",
    "profile.shareApp": "షేర్",
    "common.save": "సేవ్",
    "common.cancel": "రద్దు",
    "common.delete": "తొలగించు",
    "common.edit": "సవరించు",
    "common.confirm": "నిర్ధారించు",
    "common.loading": "లోడ్ అవుతోంది...",
    "common.error": "ఏదో తప్పు",
    "common.retry": "మళ్లీ ప్రయత్నించు",
    "common.success": "విజయం",
    "common.failed": "వైఫల్యం",
    "payment.upgrade": "ప్లాన్ అప్‌గ్రేడ్",
    "payment.trial": "ట్రయల్",
    "payment.monthly": "నెలవారీ",
    "payment.elite": "ఎలైట్",
    "payment.lifetime": "లైఫ్‌టైమ్",
    "analytics.totalUsers": "మొత్తం వినియోగదారులు",
    "analytics.revenue": "ఆదాయం",
    "analytics.teamsGenerated": "సృష్టించబడిన జట్లు",
  },
  ml: {
    "app.name": "അപ്ന ക്രിക്കറ്റ്",
    "app.tagline": "AI ഫാന്റസി ടീം ജനറേറ്റർ",
    "nav.home": "ഹോം",
    "nav.matches": "മത്സരങ്ങൾ",
    "nav.myTeams": "എന്റെ ടീമുകൾ",
    "nav.research": "ഗവേഷണം",
    "nav.profile": "പ്രൊഫൈൽ",
    "nav.admin": "അഡ്മിൻ",
    "home.generateTeams": "ടീമുകൾ സൃഷ്ടിക്കുക",
    "home.autoGenerate": "ഓട്ടോ ജനറേറ്റ്",
    "home.bulkTransfer": "ബൾക്ക് ട്രാൻസ്ഫർ",
    "home.savedMatches": "സംരക്ഷിച്ച മത്സരങ്ങൾ",
    "home.liveMatches": "തത്സമയ മത്സരങ്ങൾ",
    "home.upcomingMatches": "വരാനിരിക്കുന്ന",
    "match.selectPlayers": "കളിക്കാരെ തിരഞ്ഞെടുക്കുക",
    "match.captain": "ക്യാപ്റ്റൻ",
    "match.viceCaptain": "വൈസ് ക്യാപ്റ്റൻ",
    "match.credits": "ക്രെഡിറ്റുകൾ",
    "match.creditsLeft": "ബാക്കി ക്രെഡിറ്റുകൾ",
    "match.teamSaved": "ടീം സംരക്ഷിച്ചു",
    "match.teamDeleted": "ടീം ഇല്ലാതാക്കി",
    "match.transferTo": "കൈമാറുക",
    "match.lineupAnnounced": "ടീം പ്രഖ്യാപിച്ചു",
    "match.lineupPending": "ടീം തീർക്കാത്തത്",
    "match.riskMeter": "അപകടസാധ്യത മീറ്റർ",
    "match.captainPick": "ക്യാപ്റ്റൻ തിരഞ്ഞെടുപ്പ്",
    "profile.subscription": "സബ്സ്ക്രിപ്ഷൻ",
    "profile.settings": "ക്രമീകരണങ്ങൾ",
    "profile.logout": "ലോഗൗട്ട്",
    "profile.theme": "തീം",
    "profile.language": "ഭാഷ",
    "profile.notifications": "അറിയിപ്പുകൾ",
    "profile.helpSupport": "സഹായം",
    "profile.privacySecurity": "സ്വകാര്യത",
    "profile.referralCode": "റഫറൽ കോഡ്",
    "profile.shareApp": "പങ്കിടുക",
    "common.save": "സംരക്ഷിക്കുക",
    "common.cancel": "റദ്ദാക്കുക",
    "common.delete": "ഇല്ലാതാക്കുക",
    "common.edit": "തിരുത്തുക",
    "common.confirm": "സ്ഥിരീകരിക്കുക",
    "common.loading": "ലോഡ് ചെയ്യുന്നു...",
    "common.error": "എന്തോ തെറ്റ്",
    "common.retry": "വീണ്ടും ശ്രമിക്കുക",
    "common.success": "വിജയം",
    "common.failed": "പരാജയം",
    "payment.upgrade": "പ്ലാൻ അപ്ഗ്രേഡ്",
    "payment.trial": "ട്രയൽ",
    "payment.monthly": "പ്രതിമാസം",
    "payment.elite": "എലൈറ്റ്",
    "payment.lifetime": "ലൈഫ്ടൈം",
    "analytics.totalUsers": "മൊത്തം ഉപയോക്താക്കൾ",
    "analytics.revenue": "വരുമാനം",
    "analytics.teamsGenerated": "സൃഷ്ടിച്ച ടീമുകൾ",
  },
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Get the currently selected language (defaults to "en").
 */
export function getLanguage(): Language {
  if (!isBrowser()) return "en";
  try {
    const l = localStorage.getItem(KEY) as Language | null;
    if (l && translations[l]) return l;
  } catch {
    /* ignore */
  }
  return "en";
}

/**
 * Set the active language.
 */
export function setLanguage(lang: Language): void {
  if (!isBrowser()) return;
  if (!translations[lang]) return;
  localStorage.setItem(KEY, lang);
  // Dispatch event so React components can re-render
  window.dispatchEvent(new CustomEvent("language-change", { detail: lang }));
}

/**
 * Translate a key. Falls back to English if missing, then to the key itself.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = getLanguage();
  const dict = translations[lang] || translations.en;
  let value = dict[key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

/**
 * Hook helper for React — returns current language + setter + re-renders on change.
 * (Importing from a .ts file from React components is fine; use useSyncExternalStore
 *  if needed; for simplicity, this is a plain getter.)
 */
export function listLanguages() {
  return LANGUAGES;
}
