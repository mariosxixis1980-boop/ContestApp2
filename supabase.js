// supabase.js
// Κρατάμε τα keys στο browser (localStorage) για απλό demo/local app.
// Αν θες παραγωγή/ασφάλεια, τα server keys ΔΕΝ μπαίνουν ποτέ στο browser.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Optional legacy key used in some older files
export const CONFIG_KEY = "CMP_SUPABASE_CONFIG";

const LS_URL_KEY = "CMP_SUPABASE_URL";
const LS_ANON_KEY = "CMP_SUPABASE_ANON_KEY";

// Expose keys for other modules (backwards-compatible)
export const URL_KEY = LS_URL_KEY;
export const ANON_KEY = LS_ANON_KEY;

// (Προαιρετικά) βάλε εδώ default τιμές αν θες να μην ζητά prompt.
// Άφησέ τα κενά αν θες να τα βάζεις μόνος σου μια φορά.
const DEFAULT_SUPABASE_URL = "";
const DEFAULT_SUPABASE_ANON_KEY = "";

function isValidUrl(u) {
  if (!u) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (_) {
    return false;
  }
}

function isLikelyAnonKey(k) {
  if (!k) return false;
  // Supabase publishable keys συνήθως αρχίζουν με "sb_publishable_"
  // ή παλιά "eyJ" (JWT-like). Δεν είναι τέλειος έλεγχος, αλλά βοηθά.
  return k.startsWith("sb_publishable_") || k.startsWith("eyJ");
}

export function clearSupabaseConfig() {
  localStorage.removeItem(LS_URL_KEY);
  localStorage.removeItem(LS_ANON_KEY);
}

// Ζητά τα κλειδιά αν λείπουν/είναι άκυρα. Επιστρέφει { url, anonKey }.
export async function ensureSupabaseConfig() {
  let url = localStorage.getItem(LS_URL_KEY) || DEFAULT_SUPABASE_URL;
  let anonKey = localStorage.getItem(LS_ANON_KEY) || DEFAULT_SUPABASE_ANON_KEY;

  // Αν υπάρχει αλλά είναι "null"/"undefined" ως string
  if (url === "null" || url === "undefined") url = "";
  if (anonKey === "null" || anonKey === "undefined") anonKey = "";

  // Αν άκυρο, καθάρισε για να ξαναζητήσει.
  if (!isValidUrl(url)) url = "";
  if (!isLikelyAnonKey(anonKey)) anonKey = "";

  // Ζήτα μόνο αν λείπουν
  if (!url) {
    url = prompt("Βάλε Supabase Project URL (π.χ. https://xxxxx.supabase.co)");
    if (url) url = url.trim();
  }
  if (!anonKey) {
    anonKey = prompt("Βάλε Supabase Publishable (anon) key (sb_publishable_...)");
    if (anonKey) anonKey = anonKey.trim();
  }

  // Τελικός έλεγχος
  if (!isValidUrl(url)) {
    clearSupabaseConfig();
    throw new Error("Invalid Supabase URL. Πρέπει να είναι http/https URL.");
  }
  if (!isLikelyAnonKey(anonKey)) {
    clearSupabaseConfig();
    throw new Error("Invalid Supabase anon/publishable key.");
  }

  // Αποθήκευση
  localStorage.setItem(LS_URL_KEY, url);
  localStorage.setItem(LS_ANON_KEY, anonKey);

  return { url, anonKey };
}

// Lazy init client ώστε να μην «σπάει» το import αν λείπουν keys
let _client = null;

export async function getSupabase() {
  if (_client) return _client;
  const { url, anonKey } = await ensureSupabaseConfig();
  _client = createClient(url, anonKey);
  return _client;
}

// ------------------------------------------------------------
// ✅ Compatibility export
// Some pages import `{ supabase }` directly. We provide it here
// using top-level await (supported in ES modules).
export const supabase = await getSupabase();
