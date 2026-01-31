// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/**
 * IMPORTANT:
 * Βάλε ΕΔΩ το σωστό "anon public" key από Supabase:
 *  Supabase Dashboard → Settings → API → Project API keys → anon public
 *
 * Αν το key είναι λάθος/κομμένο, θα παίρνεις 401 (Invalid API key) σε login/register.
 */
const DEFAULT_SUPABASE_URL = "https://nljrwvrmhlrpdgeougpk.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_PUBLIC_KEY_HERE";

// Προαιρετικά: μπορείς να κάνεις override από localStorage (για δοκιμές)
const SUPABASE_URL = localStorage.getItem("CMP_SUPABASE_URL") || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = localStorage.getItem("CMP_SUPABASE_ANON_KEY") || DEFAULT_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_URL.includes("supabase.co")) {
  console.warn("Supabase URL φαίνεται λάθος. Βάλε σωστό URL στο supabase.js");
}
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "PASTE_YOUR_ANON_PUBLIC_KEY_HERE") {
  console.warn("Λείπει Supabase anon key. Βάλε το 'anon public' key στο supabase.js (Settings → API).");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
