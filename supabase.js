import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://nljrwvrmhlrpdgeougpk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I0PqYv3fuLS8cE8hxftelA_U1_huEzN';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
