import { supabase } from "./supabase.js";

export async function getUser(){
  const { data, error } = await supabase.auth.getSession();
  if (error) console.warn("getSession error:", error);
  return data?.session?.user || null;
}

export async function getProfile(userId){
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, is_admin")
    .eq("id", userId)
    .single();

  // 406 from .single() == no rows
  if (error && error.status === 406) return { profile: null, error };
  return { profile: data || null, error: error || null };
}

export function setLocalSession(user, profile){
  localStorage.setItem("session", JSON.stringify({
    username: profile?.username || (user?.email?.split("@")[0] || "user"),
    email: user?.email || "",
    isAdmin: !!profile?.is_admin
  }));
}

export async function routeByRole(){
  const user = await getUser();
  if (!user) { location.replace("login.html"); return; }

  const { profile, error } = await getProfile(user.id);
  if (error && (error.status === 401 || error.status === 403)) {
    console.warn("profiles permission error:", error);
    await supabase.auth.signOut();
    localStorage.removeItem("session");
    location.replace("login.html");
    return;
  }
  if (!profile){
    // profile missing -> sign out to avoid loops (trigger/backfill should fix it)
    await supabase.auth.signOut();
    localStorage.removeItem("session");
    location.replace("login.html");
    return;
  }

  setLocalSession(user, profile);
  location.replace(profile.is_admin ? "admin.html" : "dashboard.html");
}

export async function requireUser(){
  const user = await getUser();
  if (!user) { location.replace("login.html"); return null; }

  const { profile, error } = await getProfile(user.id);
  if (error && (error.status === 401 || error.status === 403)) {
    await supabase.auth.signOut();
    localStorage.removeItem("session");
    location.replace("login.html");
    return null;
  }
  if (!profile){
    await supabase.auth.signOut();
    localStorage.removeItem("session");
    location.replace("login.html");
    return null;
  }
  if (profile.is_admin){
    location.replace("admin.html");
    return null;
  }

  setLocalSession(user, profile);
  return { user, profile };
}

export async function requireAdmin(){
  const user = await getUser();
  if (!user) { location.replace("login.html"); return null; }

  const { profile, error } = await getProfile(user.id);
  if (error || !profile?.is_admin){
    location.replace("dashboard.html");
    return null;
  }

  setLocalSession(user, profile);
  return { user, profile };
}

export async function logout(){
  await supabase.auth.signOut();
  localStorage.removeItem("session");
  location.replace("login.html");
}