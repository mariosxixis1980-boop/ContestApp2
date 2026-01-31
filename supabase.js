// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://nljrwvrmhlrpdgeougpk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_oPFyZv4OW9n75NqORuJ8Gw_QQkY7NZe";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
