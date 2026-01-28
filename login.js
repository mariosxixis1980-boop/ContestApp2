// login.js
import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
  const KEY_NEXT = "nextContestStartISO"; // το κρατάμε όπως το είχες (localStorage)

  const $ = (id) => document.getElementById(id);

  function msg(el, text) {
    if (!el) return;
    const t = String(text || "").trim();
    el.textContent = t;
    el.style.display = t ? "block" : "none";
  }

  function norm(s) { return String(s || "").trim(); }
  function normUser(u) { return norm(u).toLowerCase(); }

  // ✅ Για να κάνουμε username login ΧΩΡΙΣ να κάνουμε query profiles (που θα ήταν unsafe),
  // χρησιμοποιούμε "fake email" αν ο user δεν δώσει κανονικό email.
  function emailFromUsername(username) {
    return `${normUser(username)}@cmp.local`;
  }

  function fmtDateGreek(isoDate) {
    const s = String(isoDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [yy, mm, dd] = s.split("-");
    return `${dd}/${mm}/${yy}`;
  }

  function renderNextContest() {
    const iso = String(localStorage.getItem(KEY_NEXT) || "").trim();
    const pretty = fmtDateGreek(iso);
    if (pretty) {
      $("nextText").textContent = `Ο επόμενος διαγωνισμός αρχίζει στις ${pretty}`;
      $("nextSub").textContent = "Μέχρι τότε μπορείς να κάνεις login κανονικά.";
    } else {
      $("nextText").textContent = "Ο επόμενος διαγωνισμός θα ανακοινωθεί σύντομα";
      $("nextSub").textContent = "Ο admin θα βάλει ημερομηνία από το Admin Panel.";
    }
  }

  function showLogin() {
    msg($("loginErr"), "");
    msg($("regErr"), "");
    $("loginBox").classList.remove("hide");
    $("registerBox").classList.add("hide");
    $("tabLogin").className = "btn a tab";
    $("tabRegister").className = "btn tab";
  }

  function showRegister() {
    msg($("loginErr"), "");
    msg($("regErr"), "");
    $("registerBox").classList.remove("hide");
    $("loginBox").classList.add("hide");
    $("tabRegister").className = "btn a tab";
    $("tabLogin").className = "btn tab";
  }

  async function goAfterAuth(user) {
    // Διάβασε το profile (RLS: επιτρέπει μόνο το δικό του)
    const { data, error } = await supabase
      .from("profiles")
      .select("username,is_admin")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("profile read error:", error);
      // Αν δεν βρει profile, κάτι δεν πήγε καλά με trigger/sql
      msg($("loginErr"), "⛔ Δεν βρέθηκε profile. Δες το SQL/trigger (profiles).");
      return;
    }

    // redirect
    if (data?.is_admin) location.href = "admin.html";
    else location.href = "dashboard.html";
  }

  async function doLogin() {
    msg($("loginErr"), "");

    const userOrEmail = norm($("loginUser").value);
    const password = String($("loginPass").value || "");

    if (!userOrEmail || !password) {
      return msg($("loginErr"), "Γράψε username/email και password.");
    }

    const email = userOrEmail.includes("@")
      ? userOrEmail
      : emailFromUsername(userOrEmail);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error("login error:", error);
      return msg($("loginErr"), "Λάθος στοιχεία ή δεν υπάρχει χρήστης.");
    }

    await goAfterAuth(data.user);
  }

  async function doRegister() {
    msg($("regErr"), "");

    const username = norm($("regUser").value);
    const password = String($("regPass").value || "");
    const emailInput = norm($("regEmail").value);

    if (!username || !password) {
      return msg($("regErr"), "Βάλε username και password για εγγραφή.");
    }

    // Αν δεν δώσει email, φτιάχνουμε deterministic email από username
    const email = emailInput ? emailInput : emailFromUsername(username);

    // Sign up + βάζουμε username στο user metadata, για να το πάρει ο trigger
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username }
      }
    });

    if (error) {
      console.error("signup error:", error);
      return msg($("regErr"), "⛔ Δεν έγινε εγγραφή: " + error.message);
    }

    // Αν το project έχει email confirmation ON, μπορεί να μην μπαίνει αμέσως.
    // Για dev: καλύτερα να το κλείσεις (Authentication → Providers → Email → Confirm email OFF)
    msg($("loginErr"), "✅ Έγινε εγγραφή! Τώρα κάνε login.");
    showLogin();
    $("loginUser").value = username;
    $("loginPass").value = "";
  }

  function clearLoginInputs() {
    $("loginUser").value = "";
    $("loginPass").value = "";
    msg($("loginErr"), "");
  }

  function clearRegisterInputs() {
    $("regUser").value = "";
    $("regPass").value = "";
    $("regEmail").value = "";
    msg($("regErr"), "");
  }

  async function init() {
    // Tabs + buttons
    $("tabLogin").addEventListener("click", showLogin);
    $("tabRegister").addEventListener("click", showRegister);

    $("loginBtn").addEventListener("click", doLogin);
    $("clearBtn").addEventListener("click", clearLoginInputs);

    $("regBtn").addEventListener("click", doRegister);
    $("regClearBtn").addEventListener("click", clearRegisterInputs);

    renderNextContest();
    showLogin();

    // Αν υπάρχει ήδη session → redirect
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (user) await goAfterAuth(user);
  }

  init();
});
