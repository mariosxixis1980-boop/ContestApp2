// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Cyprus Match Predict (CMP) - Supabase client
const SUPABASE_URL = "https://nljrwvrmhlrpdgeougpk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_I0PqYv3fuLS8cE8hxftelA_U1_huEzN";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
