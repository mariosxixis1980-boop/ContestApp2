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

  // Treat 406 as "no row"
  if (error && error.status === 406) return { profile: null, error };
  return { profile: data || null, error: error || null };
}

export async function routeByRole(){
  const user = await getUser();
  if (!user) { location.replace("login.html"); return; }

  const { profile, error } = await getProfile(user.id);
  if (error && (error.status === 401 || error.status === 403)) {
    // RLS/permission
    console.warn("profiles permission error:", error);
    await supabase.auth.signOut();
    location.replace("login.html");
    return;
  }
  if (!profile){
    // If profile missing, don't loop: sign out and stay on login
    console.warn("profile missing; signOut to avoid loops");
    await supabase.auth.signOut();
    location.replace("login.html");
    return;
  }

  localStorage.setItem("session", JSON.stringify({
    username: profile.username || (user.email?.split("@")[0] || "user"),
    email: user.email || "",
    isAdmin: !!profile.is_admin
  }));

  location.replace(profile.is_admin ? "admin.html" : "dashboard.html");
}

export async function requireAdmin(){
  const user = await getUser();
  if (!user) { location.replace("login.html"); return null; }

  const { profile, error } = await getProfile(user.id);
  if (error || !profile?.is_admin) { location.replace("dashboard.html"); return null; }
  // overwrite local session
  localStorage.setItem("session", JSON.stringify({
    username: profile.username || (user.email?.split("@")[0] || "admin"),
    email: user.email || "",
    isAdmin: true
  }));
  return { user, profile };
}

export async function requireUser(){
  const user = await getUser();
  if (!user) { location.replace("login.html"); return null; }

  const { profile, error } = await getProfile(user.id);
  if (error) { location.replace("login.html"); return null; }
  if (profile?.is_admin) { location.replace("admin.html"); return null; }

  localStorage.setItem("session", JSON.stringify({
    username: profile?.username || (user.email?.split("@")[0] || "user"),
    email: user.email || "",
    isAdmin: false
  }));
  return { user, profile };
}

export async function logout(){
  await supabase.auth.signOut();
  localStorage.removeItem("session");
  location.replace("login.html");
}