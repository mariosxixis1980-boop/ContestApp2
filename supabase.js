// supabase.js (browser module)
// Βάζει / θυμάται SUPABASE_URL και SUPABASE_ANON_KEY στο localStorage και δίνει έτοιμο client.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function promptMissing(label){
  const v = window.prompt(label);
  return (v || "").trim();
}

export function clearSupabaseConfig(){
  localStorage.removeItem("CMP_SUPABASE_URL");
  localStorage.removeItem("CMP_SUPABASE_ANON_KEY");
}

export async function getSupabase(){
  let url = localStorage.getItem("CMP_SUPABASE_URL") || "";
  let key = localStorage.getItem("CMP_SUPABASE_ANON_KEY") || "";

  if(!url){
    url = promptMissing("Βάλε SUPABASE PROJECT URL (π.χ. https://xxxx.supabase.co):");
    if(url) localStorage.setItem("CMP_SUPABASE_URL", url);
  }
  if(!key){
    key = promptMissing("Βάλε SUPABASE ANON KEY:");
    if(key) localStorage.setItem("CMP_SUPABASE_ANON_KEY", key);
  }

  if(!url || !key){
    throw new Error("Missing Supabase URL / ANON KEY");
  }

  url = url.replace(/\/+$/,"");

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

// Για απλό import { supabase } από άλλα modules.
export const supabase = await getSupabase();
