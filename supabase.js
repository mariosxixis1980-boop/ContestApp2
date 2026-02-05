
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = localStorage.getItem('CMP_SUPABASE_URL');
const SUPABASE_KEY = localStorage.getItem('CMP_SUPABASE_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('Supabase URL ή KEY λείπουν από το localStorage');
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

