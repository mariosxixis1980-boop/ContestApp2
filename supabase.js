// supabase.js (ES Module)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/*
  This app reads Supabase credentials from localStorage so you don't hardcode keys in GitHub.
  1) Put your Project URL and anon key once (it will remember):
     - CMP_SUPABASE_URL
     - CMP_SUPABASE_ANON_KEY

  If missing, you'll be asked once via prompt().
*/

const STORAGE_URL_KEY = 'CMP_SUPABASE_URL';
const STORAGE_ANON_KEY = 'CMP_SUPABASE_ANON_KEY';

function getOrAsk(key, label) {
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing.trim();

  const val = prompt(`Βάλε ${label} (θα αποθηκευτεί στο browser).`);
  if (val && val.trim()) {
    localStorage.setItem(key, val.trim());
    return val.trim();
  }
  return '';
}

const SUPABASE_URL = getOrAsk(STORAGE_URL_KEY, 'Supabase Project URL');
const SUPABASE_ANON_KEY = getOrAsk(STORAGE_ANON_KEY, 'Supabase anon public key');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials missing. Please set CMP_SUPABASE_URL and CMP_SUPABASE_ANON_KEY in localStorage.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, username, is_admin, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function signOutSafe() {
  try { await supabase.auth.signOut(); } catch (_) {}
}
