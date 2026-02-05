import { getSupabase, clearSupabaseConfig } from "./supabase.js";

let supabase;
try {
  supabase = await getSupabase();
} catch (e) {
  console.error("Supabase config missing/invalid:", e);
  alert("Δεν βρέθηκε σωστό Supabase URL / Anon key. Πήγαινε στη Login σελίδα και βάλε τα σωστά στοιχεία.");
  location.replace("login.html");
  throw e;
}

/* =========================
   ✅ SUPABASE SESSION -> localStorage session (app-wide)
========================= */
const { data: { session }, error: sessErr } = await supabase.auth.getSession();
if (sessErr) console.warn("getSession error:", sessErr);

if (!session || !session.user) {
  location.replace("login.html");
  throw new Error("Not logged in");
}

const email = String(session.user.email || "").toLowerCase();
const username = (email.split("@")[0] || "user").trim();

// Admin flag comes from DB (profiles.is_admin)
let isAdmin = false;
try {
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", session.user.id)
    .maybeSingle();

  isAdmin = !!prof?.is_admin;

  // keep local session consistent
  localStorage.setItem("session", JSON.stringify({ username, email, isAdmin }));

  if (!isAdmin) {
    window.location.href = "dashboard.html";
  }
} catch (e) {
  console.error(e);
  window.location.href = "dashboard.html";
}

/* =========================
   admin.js (FULL FILE)
   - localStorage-driven contest engine
   - ✅ Professional inline notifications (N)
   - ✅ normalizeUsers to prevent junk rows (a/s/q)
   - ✅ eligibleUsers created ONLY from normalized users list
========================= */

const K = {
  S: "session",
  A: "activeContest",
  M: "contestMatches",
  P: "picks",
  U: "users",
  H: "help199",
  ST: "scores",
  SB: "scoresByContest",
  META: "contestMeta",
  RL: "roundLockedAt",
  NEXT: "nextContestStartISO",
  LOCK: "picksLocked",
  TIE: "tieStatsByContest",
};

const $ = (id) => document.getElementById(id);
const R = (k, f) => {
  try {
    return JSON.parse(localStorage.getItem(k) || JSON.stringify(f));
  } catch {
    return f;
  }
};
const W = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const now = () => Date.now();

const E = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

/* =========================
   ✅ INLINE NOTIFICATIONS (Admin)
========================= */
function N(msg, type = "warn") {
  const el = $("notice");
  if (!el) return;

  const t = String(msg || "").trim();
  if (!t) {
    el.textContent = "";
    el.className = "notice";
    el.style.display = "none";
    return;
  }

  const cls = (type === "ok" ? "ok" : type === "err" ? "err" : "warn");
  el.textContent = t;
  el.className = "notice " + cls;
  el.style.display = "block";

  clearTimeout(window.__n);
  window.__n = setTimeout(() => N(""), 2600);
}

/* =========================
   ✅ USERS NORMALIZER
   - removes junk (a/s/q without email)
========================= */
function normalizeUsers(list) {
  let arr = Array.isArray(list) ? list : [];
  arr = arr
    .map((u) => ({
      username: String(u?.username || "").trim(),
      email: String(u?.email || "").trim(),
      isAdmin: !!u?.isAdmin,
    }))
    .filter((u) => u.username.length >= 2 && u.email.includes("@"));

  const seen = new Set();
  const out = [];
  for (const u of arr) {
    const key = (u.email || u.username).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function sess() { return R(K.S, null); }
function isAdm(s) { return !!(s && s.isAdmin === true); }

/* =========================
   STATE
========================= */
let active = null;
let matches = [];

/* =========================
   META STORE
========================= */
function metaAll() {
  const m = R(K.META, {});
  return (m && typeof m === "object") ? m : {};
}
function getMeta(cid) {
  return metaAll()[cid] || null;
}
function setMeta(cid, patch) {
  const all = metaAll();
  all[cid] = all[cid] || {
    round: 1,
    prizeText: "",
    contestEndsAtISO: null,

    contestStarted: false,
    startedAt: null,

    matchesLocked: false,
    resultsLocked: false,
    roundClosed: false,

    eligibleUsers: [],
    lastScoredRound: 0,

    finalWeek: false,
    finalWinner: null,
    finalWinnerAt: null,
  };
  all[cid] = { ...all[cid], ...(patch || {}) };
  W(K.META, all);
  return all[cid];
}

/* =========================
   ✅ SUPABASE SYNC (published/active)
   - Ο πελάτης θα βλέπει contest ΜΟΝΟ από Supabase όπου
     published=true ΚΑΙ active=true
   - Εδώ κάνουμε mirror το localStorage contest -> Supabase
   - Αν δεν υπάρχουν οι στήλες/meta/matches στο table contests,
     θα δεις error στο console (τότε το φτιάχνουμε στο Supabase).
========================= */
let __syncTimer = null;
function queueSync() {
  clearTimeout(__syncTimer);
  __syncTimer = setTimeout(() => syncContestToSupabase().catch(() => {}), 450);
}

async function syncContestToSupabase() {
  try {
    if (!active || !active.id) return;
    const cid = active.id;
    const mta = getMeta(cid) || {};

    const published = (mta.contestStarted === true) && (mta.matchesLocked === true);
    const activeFlag = (mta.contestStarted === true);

    // deadline = 10' πριν τον 1ο ON αγώνα
    const dlMs = deadlineMsFromMatches(matches);
    const deadlineISO = dlMs ? new Date(dlMs).toISOString() : null;

    const payload = {
      code: cid,
      round: Number(mta.round || 1),
      published: !!published,
      prize_text: (mta.prizeText || null),
      started_at: (mta.startedAt ? new Date(Number(mta.startedAt)).toISOString() : null),
      deadline_iso: deadlineISO,
      meta: mta,
      matches: matches,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("contests")
      .upsert(payload, { onConflict: "code" });

    if (error) {
      console.warn("Supabase sync error:", error);
    }
  } catch (e) {
    console.warn("Supabase sync exception:", e);
  }
}

/* =========================
   TIME HELPERS
========================= */
function startMs(m) {
  const t = new Date(m.startISO).getTime();
  return Number.isFinite(t) ? t : NaN;
}
function fmt(ms) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
function deadlineMsFromMatches(arr) {
  const starts = (arr || [])
    .filter((x) => x && x.off !== true)
    .map(startMs)
    .filter(Number.isFinite);
  if (!starts.length) return null;
  return Math.min(...starts) - 10 * 60 * 1000;
}
function deadlinePassed() {
  if (!Array.isArray(matches) || matches.length === 0) return false;
  if (matches.some((m) => !m || !m.startISO)) return false;
  const dl = deadlineMsFromMatches(matches);
  if (!dl) return false;
  return now() >= dl;
}

function nid() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }

function ensure() {
  if (!active) {
    N("Δεν υπάρχει ενεργός διαγωνισμός.", "err");
    return false;
  }
  return true;
}

/* =========================
   RESET / NEW CONTEST
========================= */
function resetContestDataAll() {
  W(K.ST, {});
  W(K.SB, {});
  W(K.P, {});
  W(K.H, {});
  W(K.META, {});
  W(K.M, []);
  W(K.RL, {});
  W(K.LOCK, {});
  W(K.TIE, {});
  W(K.A, null);
}

function newContest() {
  if (!confirm("Νέος διαγωνισμός;")) return;
  if (!confirm("ΣΙΓΟΥΡΑ; Θα γίνει RESET: βαθμοί + picks + help + meta.")) return;

  resetContestDataAll();

  const id = nid();
  active = { id };
  matches = [];
  W(K.A, active);
  W(K.M, matches);

  setMeta(id, {
    round: 1,
    matchesLocked: false,
    resultsLocked: false,
    roundClosed: false,
    contestStarted: false,
    prizeText: "",
    contestEndsAtISO: null,
    eligibleUsers: [],
    lastScoredRound: 0,
    finalWeek: false,
    finalWinner: null,
    finalWinnerAt: null,
  });

  N("✅ Νέος διαγωνισμός: " + id, "ok");
  render();
}

/* =========================
   START CONTEST (LOCK PRIZE/ENDS + snapshot eligibleUsers)
========================= */
function toggleContestStart() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.contestStarted) return N("✅ Ο διαγωνισμός είναι ήδη ΕΝΕΡΓΟΣ.", "ok");

  if (!confirm("Κλείδωμα διαγωνισμού (έναρξη); Θα κλειδώσει βραβείο + λήξη.")) return;
  if (!confirm("ΣΙΓΟΥΡΑ;")) return;

  // ✅ take eligibleUsers from normalized users list
  const usersArr = normalizeUsers(R(K.U, []));
  W(K.U, usersArr);
  const eligible = usersArr.map((u) => String(u.username || "").trim()).filter(Boolean);

  setMeta(cid, { contestStarted: true, startedAt: now(), eligibleUsers: eligible });

  N("✅ Ο διαγωνισμός έγινε ΕΝΕΡΓΟΣ.", "ok");
  render();
}

/* =========================
   MATCHES LOCK / ADD MATCH
========================= */
function toggleMatchesLock() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});

  if (mta.resultsLocked) return N("🔒 Κλειδωμένα τελικά. Δεν αλλάζει η λίστα.", "err");
  if (deadlinePassed()) return N("⛔ Πέρασε το deadline. Δεν αλλάζεις λίστα/ώρα/ομάδες.", "err");

  const next = !mta.matchesLocked;
  setMeta(cid, { matchesLocked: next });
  N(next ? "🔒 Κλείδωσαν οι αγώνες." : "🔓 Ξεκλείδωσαν οι αγώνες.", "ok");
  render();
}

function addMatch() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.resultsLocked) return N("🔒 Κλειδωμένα τελικά. Δεν αλλάζεις.", "err");
  if (deadlinePassed()) return N("⛔ Πέρασε το deadline. Δεν αλλάζεις λίστα.", "err");
  if (mta.matchesLocked) return N("🔒 Αγώνες κλειδωμένοι. Ξεκλείδωσε.", "err");
  if (matches.length >= 10) return N("Max 10", "err");

  const d = $("d")?.value || "";
  const t = $("t")?.value || "";
  const h = ($("h")?.value || "").trim();
  const a = ($("a")?.value || "").trim();
  if (!d || !t || !h || !a) return N("Συμπλήρωσε όλα τα στοιχεία.", "warn");

  const id = "m_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  matches.push({
    id,
    n: matches.length + 1,
    date: d,
    time: t,
    home: h,
    away: a,
    startISO: d + "T" + t + ":00",
    off: false,
    result: "",
  });

  W(K.M, matches);
  if ($("h")) $("h").value = "";
  if ($("a")) $("a").value = "";

  N("✅ Added", "ok");
  render();
}

function toggleOff(mid) {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.resultsLocked) return N("🔒 Κλειδωμένα τελικά. Δεν αλλάζει OFF.", "err");

  const m = matches.find((x) => x.id === mid);
  if (!m) return;

  m.off = !m.off;
  if (m.off) m.result = "";
  W(K.M, matches);
  render();
}

function saveRes(mid) {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.resultsLocked) return N("🔒 Κλειδωμένα τελικά.", "err");

  const m = matches.find((x) => x.id === mid);
  if (!m) return;
  if (m.off) return N("OFF δεν παίρνει τελικό.", "warn");

  const v = ($("res_" + mid)?.value || "").trim();
  if (!v) return N("Διάλεξε 1/X/2", "warn");

  m.result = v;
  W(K.M, matches);

  N("✅ Saved τελικό", "ok");
  render();
}

/* =========================
   SCORING
========================= */
function computeWeekScores() {
  const cid = active?.id;
  if (!cid) return {};

  const picksAll = R(K.P, {});
  const cp = picksAll?.[cid] || {};
  const users = Object.keys(cp || {});
  const perWeek = {};

  for (const u of users) {
    const map = cp[u] || {};
    let pts = 0, ok = 0, req = 0;

    for (const m of matches) {
      const pick = (map?.[m.id]?.pick || "").trim();

      if (m.off) {
        // OFF game: HELP counts 1 (optional behavior)
        if (pick === "HELP") pts += 1;
        continue;
      }

      if (!m.result) continue;

      req++;
      if (pick === "HELP") { pts += 1; ok++; continue; }
      if (pick && pick === m.result) { pts += 1; ok++; }
    }

    if (req > 0 && ok === req) pts += 2; // bonus +2
    perWeek[u] = pts;
  }

  return perWeek;
}

function computeWeekStatsForTieBreaks() {
  const cid = active?.id;
  if (!cid) return {};

  const picksAll = R(K.P, {});
  const cp = picksAll?.[cid] || {};
  const users = Object.keys(cp || {});
  const out = {};

  for (const u of users) {
    const map = cp[u] || {};
    let req = 0, ok = 0;

    for (const m of matches) {
      const pick = (map?.[m.id]?.pick || "").trim();

      if (m.off) continue;
      const res = (m.result || "").trim();
      if (!res) continue;

      req++;
      if (pick === "HELP") { ok++; continue; }
      if (pick && pick === res) ok++;
    }

    const bonusHit = (req > 0 && ok === req);
    const nearPerfect = (req > 1 && ok === req - 1);

    out[u] = { req, ok, bonusHit, nearPerfect };
  }

  return out;
}

function addWeekScoresToContest(perWeek) {
  const cid = active?.id;
  if (!cid) return;

  const by = R(K.SB, {});
  by[cid] = by[cid] || {};
  const cur = by[cid];

  for (const u of Object.keys(perWeek || {})) {
    cur[u] = (Number(cur[u]) || 0) + (Number(perWeek[u]) || 0);
  }

  by[cid] = cur;
  W(K.SB, by);

  rebuildTotalsFromBy();
}

function rebuildTotalsFromBy() {
  const by = R(K.SB, {});
  const total2 = {};

  for (const cc of Object.keys(by || {})) {
    const b = by[cc] || {};
    for (const u of Object.keys(b || {})) {
      total2[u] = (Number(total2[u]) || 0) + (Number(b[u]) || 0);
    }
  }

  W(K.ST, total2);
}

function calculateScores() {
  rebuildTotalsFromBy();
  N("✅ Totals refreshed", "ok");
}

/* =========================
   TIE STATS (Final Week tie-break helpers)
========================= */
function tieAll() {
  const t = R(K.TIE, {});
  return (t && typeof t === "object") ? t : {};
}
function getTieStats(cid) {
  const all = tieAll();
  return (all[cid] && typeof all[cid] === "object") ? all[cid] : {};
}
function setTieStats(cid, obj) {
  const all = tieAll();
  all[cid] = obj || {};
  W(K.TIE, all);
}

function updateTieStatsAfterWeek(weekStats) {
  const cid = active?.id;
  if (!cid) return;

  const statsMap = (weekStats && typeof weekStats === "object") ? weekStats : {};
  const users = Object.keys(statsMap);
  if (!users.length) return;

  const existing = getTieStats(cid);

  for (const u of users) {
    const st = statsMap[u] || {};
    const bonusHit = st.bonusHit === true;
    const nearPerfect = st.nearPerfect === true;

    const cur = existing[u] || {
      bonusCount: 0,
      bonusStreakCur: 0,
      bonusStreakMax: 0,
      nearPerfectCount: 0,
    };

    cur.bonusCount = Number(cur.bonusCount || 0) + (bonusHit ? 1 : 0);

    const prevCur = Number(cur.bonusStreakCur || 0);
    const newCur = bonusHit ? (prevCur + 1) : 0;
    cur.bonusStreakCur = newCur;

    const prevMax = Number(cur.bonusStreakMax || 0);
    if (newCur > prevMax) cur.bonusStreakMax = newCur;

    cur.nearPerfectCount = Number(cur.nearPerfectCount || 0) + (nearPerfect ? 1 : 0);

    existing[u] = cur;
  }

  setTieStats(cid, existing);
}

/* =========================
   FINAL WEEK TOGGLE
========================= */
function toggleFinalWeek() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});

  const cur = (mta.finalWeek === true);

  if (!confirm(cur ? "Να ΑΠΕΝΕΡΓΟΠΟΙΗΘΕΙ το Final Week;" : "Να ΕΝΕΡΓΟΠΟΙΗΘΕΙ το Final Week;")) return;
  if (!confirm("ΣΙΓΟΥΡΑ;")) return;

  setMeta(cid, { finalWeek: !cur, finalWinner: null, finalWinnerAt: null });

  N(!cur ? "🏁 Final Week: ΕΝΕΡΓΟ" : "🏁 Final Week: ΑΝΕΝΕΡΓΟ", "ok");
  render();
}

/* =========================
   LOCK FINAL RESULTS (adds week points once)
========================= */
function lockFinalResults() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.resultsLocked) return N("✅ Τα τελικά είναι ήδη κλειδωμένα.", "ok");

  const need = matches.filter((x) => !x.off).filter((x) => !x.result);
  if (need.length) return N("⛔ Λείπουν τελικά σε ON αγώνες.", "err");

  const roundNow = Number(mta.round || 1);
  if (Number(mta.lastScoredRound || 0) === roundNow) {
    return N("⛔ Οι βαθμοί για αυτή την αγωνιστική έχουν ήδη προστεθεί.", "err");
  }

  if (!confirm("Θες να τα ελέγξεις ξανά;")) return;
  if (!confirm("Είναι ΟΛΑ σωστά;")) return;

  setMeta(cid, { resultsLocked: true });

  const perWeek = computeWeekScores();
  addWeekScoresToContest(perWeek);

  const weekStats = computeWeekStatsForTieBreaks();
  updateTieStatsAfterWeek(weekStats);

  // ✅ clear any previous final winner snapshot
  setMeta(cid, { lastScoredRound: roundNow, finalWinner: null, finalWinnerAt: null });

  N("🔒 Τελικά κλειδώθηκαν & οι βαθμοί ΠΡΟΣΤΕΘΗΚΑΝ στη συνολική βαθμολογία", "ok");
  render();
}

/* =========================
   NEXT ROUND
========================= */
function nextRound() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});

  if (!mta.resultsLocked) {
    return N("⛔ Πρώτα «Κλείδωμα Τελικών» για να μπουν οι βαθμοί της αγωνιστικής.", "err");
  }

  if (!confirm("➡️ Επόμενη αγωνιστική; Θα διαγραφούν ΟΛΟΙ οι αγώνες από τη λίστα.")) return;
  if (!confirm("ΣΙΓΟΥΡΑ; (Οι βαθμοί ΔΕΝ θα διαγραφούν)")) return;

  const newRound = (Number(mta.round) || 1) + 1;

  matches = [];
  W(K.M, matches);

  setMeta(cid, {
    round: newRound,
    matchesLocked: false,
    resultsLocked: false,
    roundClosed: false,
    finalWinner: null,
    finalWinnerAt: null,
  });

  const locks = R(K.LOCK, {});
  if (locks && locks[cid]) delete locks[cid];
  W(K.LOCK, locks);

  N("✅ Έγινε! Άδειασε η λίστα αγώνων — τώρα βάλε νέους αγώνες για Γύρο " + newRound, "ok");
  render();
}

/* =========================
   PRIZE + ENDS
========================= */
function renderPrize() {
  const cid = active?.id;
  if (!cid) {
    if ($("pt")) $("pt").textContent = "-";
    if ($("pz")) $("pz").value = "";
    if ($("end")) $("end").value = "";
    return;
  }

  const mta = getMeta(cid) || setMeta(cid, {});
  if ($("pz")) $("pz").value = mta.prizeText || "";
  if ($("end")) $("end").value = mta.contestEndsAtISO ? String(mta.contestEndsAtISO).slice(0, 10) : "";

  const started = !!mta.contestStarted;
  if ($("pt")) $("pt").textContent = started ? "🔒" : "🟢";

  // lock inputs after start
  if ($("pz")) $("pz").disabled = started;
  if ($("ps")) $("ps").disabled = started;
  if ($("pc")) $("pc").disabled = started;
  if ($("end")) $("end").disabled = started;
  if ($("es")) $("es").disabled = started;
  if ($("ec")) $("ec").disabled = started;
}

function savePrize() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.contestStarted) return N("🔒 Κλειδωμένο (έχει ξεκινήσει)", "err");

  const txt = ($("pz")?.value || "").trim();
  if (!txt) return N("Γράψε βραβείο", "warn");

  setMeta(cid, { prizeText: txt });
  N("✅ Saved prize", "ok");
  renderPrize();
}
function clearPrize() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.contestStarted) return N("🔒 Κλειδωμένο (έχει ξεκινήσει)", "err");

  setMeta(cid, { prizeText: "" });
  N("🧽 Cleared prize", "ok");
  renderPrize();
}
function saveEnds() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.contestStarted) return N("🔒 Κλειδωμένο (έχει ξεκινήσει)", "err");

  const v = ($("end")?.value || "").trim();
  if (!v) return N("Βάλε ημερομηνία", "warn");

  setMeta(cid, { contestEndsAtISO: v + "T00:00:00" });
  N("✅ Saved end date", "ok");
  renderPrize();
}
function clearEnds() {
  if (!ensure()) return;
  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if (mta.contestStarted) return N("🔒 Κλειδωμένο (έχει ξεκινήσει)", "err");

  setMeta(cid, { contestEndsAtISO: null });
  N("🧽 Cleared end date", "ok");
  renderPrize();
}

/* =========================
   USERS / HELP PANELS
========================= */
function activeUsersByContest() {
  if (!ensure()) return;
  const cid = active.id;

  const picks = R(K.P, {});
  const cp = picks?.[cid] || {};
  const users = Object.keys(cp || {}).sort((a, b) => a.localeCompare(b));

  if (!users.length) {
    $("side").innerHTML = '<div class="pill">Κανένας ενεργός σε αυτό το contest</div>';
    return;
  }

  $("side").innerHTML = `<div class="pill">Ενεργοί (contest): ${users.length}</div>
  <table><thead><tr><th>User</th><th>Has picks</th></tr></thead><tbody>${
    users.map((u) => `<tr><td>${E(u)}</td><td>ΝΑΙ</td></tr>`).join("")
  }</tbody></table>`;
}

function openUsers() {
  // ✅ καθάρισε users, ξαναγράψε καθαρά
  const raw = R(K.U, []);
  const users = normalizeUsers(raw);
  W(K.U, users);

  if (!users.length) {
    $("side").innerHTML = '<div class="pill">No users</div>';
    return;
  }

  $("side").innerHTML = `<div class="pill">Users: ${users.length}</div>
  <table><thead><tr><th>Username</th><th>Email</th><th>Admin</th></tr></thead><tbody>${
    users
      .sort((a, b) => a.username.localeCompare(b.username))
      .map((u) => `<tr>
        <td>${E(u.username || "-")}</td>
        <td>${E(u.email || "-")}</td>
        <td>${u.isAdmin ? "ΝΑΙ" : "-"}</td>
      </tr>`).join("")
  }</tbody></table>`;
}

function openHelp() {
  if (!ensure()) return;
  const cid = active.id;

  const h = R(K.H, {});
  const map = h?.[cid] || {};
  const arr = Object.entries(map).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  if (!arr.length) {
    $("side").innerHTML = '<div class="pill">Καμία αγορά €1.99</div>';
    return;
  }

  $("side").innerHTML = `<div class="pill">€1.99: ${arr.length}</div>
  <table><thead><tr><th>User</th><th>Used</th><th>Remaining</th><th>PaidAt</th></tr></thead><tbody>${
    arr.map(([u, o]) => {
      const used = (o?.usedMatchIds?.length || 0);
      const rem = Number(o?.remaining || 0);
      const paidAt = o?.paidAt ? new Date(o.paidAt).toLocaleString() : "-";
      return `<tr>
        <td>${E(u)}</td>
        <td>${E(used)}</td>
        <td>${E(rem)}</td>
        <td>${E(paidAt)}</td>
      </tr>`;
    }).join("")
  }</tbody></table>`;
}

/* =========================
   NEXT CONTEST START (shown on login)
========================= */
function renderNextStart() {
  const v = String(R(K.NEXT, "") || "").trim();
  if ($("nextStart")) $("nextStart").value = v ? v.slice(0, 10) : "";
  if ($("nsPreview")) {
    $("nsPreview").textContent = v ? ("Θα εμφανίζεται στο login: " + v.slice(0, 10)) : "-";
  }
}
function saveNextStart() {
  const v = ($("nextStart")?.value || "").trim();
  if (!v) return N("Βάλε ημερομηνία", "warn");
  W(K.NEXT, v + "T00:00:00");
  N("✅ Saved next contest start", "ok");
  renderNextStart();
}
function clearNextStart() {
  W(K.NEXT, "");
  N("🧽 Cleared next contest start", "ok");
  renderNextStart();
}

/* =========================
   RENDER MATCHES
========================= */
function renderMatches() {
  const box = $("ms");
  if (!box) return;

  if (!active) {
    box.innerHTML = '<div class="pill">No contest</div>';
    return;
  }
  if (!Array.isArray(matches) || !matches.length) {
    box.innerHTML = '<div class="pill">Δεν υπάρχουν αγώνες</div>';
    return;
  }

  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  const hard = deadlinePassed();

  const note = mta.resultsLocked
    ? `<div class="pill r">🔒 Τελικά κλειδωμένα (δεν αλλάζει τίποτα)</div>`
    : (hard
      ? `<div class="pill a">⏱ Deadline πέρασε (δεν αλλάζεις λίστα/ώρα/ομάδες). OFF & τελικά επιτρέπονται.</div>`
      : (mta.matchesLocked
        ? `<div class="pill a">🔒 Αγώνες κλειδωμένοι (λίστα)</div>`
        : `<div class="pill g">🔓 Αγώνες ανοικτοί (λίστα)</div>`));

  box.innerHTML = note + matches.map((m) => {
    const st = m.off ? "⚫ OFF" : "🟢 ON";
    const res = m.result || "-";
    const offDisabled = mta.resultsLocked ? "disabled" : "";

    return `<div class="match ${m.off ? "off" : ""} ${mta.resultsLocked ? "resultsLockedCard" : ""}">
      <div class="row" style="margin-top:0;justify-content:space-between">
        <div>
          <div class="mini">${m.n} • ${E(m.date)} ${E(m.time)} • ${st}</div>
          <div class="big">${E(m.home)} <span class="mini">vs</span> ${E(m.away)}</div>
        </div>
        <div class="pill">Τελικό: <b>${E(res)}</b></div>
      </div>

      <div class="row" style="align-items:flex-end">
        <button class="btn a" ${offDisabled} onclick="toggleOff('${m.id}')">${m.off ? "ON" : "OFF"}</button>
        <div style="flex:1"></div>
        <div style="min-width:160px">
          <label class="mini">Τελικό</label>
          <select id="res_${m.id}" ${m.off || mta.resultsLocked ? "disabled" : ""}>
            <option value=""></option>
            <option value="1" ${m.result === "1" ? "selected" : ""}>1</option>
            <option value="X" ${m.result === "X" ? "selected" : ""}>X</option>
            <option value="2" ${m.result === "2" ? "selected" : ""}>2</option>
          </select>
        </div>
        <button class="btn g" ${m.off || mta.resultsLocked ? "disabled" : ""} onclick="saveRes('${m.id}')">💾 Save</button>
      </div>

      <div class="mini">OFF = αναβολή/διακοπή (φαίνεται στον πελάτη). Μπορείς να το γυρίσεις OFF πριν κλειδώσεις τελικά.</div>
    </div>`;
  }).join("");
}

/* =========================
   TOP + HEADER RENDER
========================= */
function renderTop() {
  const s = sess();

  if ($("w")) $("w").textContent = "User: " + (s?.username || "-");
  if ($("st")) $("st").textContent = "Admin: " + (isAdm(s) ? "NAI" : "OXI");

  if (!active) {
    if ($("ciTop")) $("ciTop").textContent = "Contest:-";
    if ($("wk")) $("wk").textContent = "Αγωνιστική:-";
    if ($("dlTop")) $("dlTop").textContent = "Deadline:-";
    return;
  }

  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if ($("ciTop")) $("ciTop").textContent = "Contest: " + cid;
  if ($("wk")) $("wk").textContent = "Αγωνιστική: " + (mta.round || 1);

  const dl = deadlineMsFromMatches(matches);
  if ($("dlTop")) $("dlTop").textContent = "Deadline: " + (dl ? fmt(dl) : "-");
}

function renderContestPills() {
  if (!active) {
    if ($("ci")) $("ci").textContent = "Contest:-";
    if ($("ri")) $("ri").textContent = "Round:-";
    if ($("li")) $("li").textContent = "Αγώνες:-";
    if ($("dl")) $("dl").textContent = "Deadline:-";
    return;
  }

  const cid = active.id;
  const mta = getMeta(cid) || setMeta(cid, {});
  if ($("ci")) $("ci").textContent = "Contest: " + cid;
  if ($("ri")) $("ri").textContent = "Round: " + (mta.round || 1);
  if ($("li")) $("li").textContent = "Αγώνες: " + (Array.isArray(matches) ? matches.length : 0);

  const dl = deadlineMsFromMatches(matches);
  if ($("dl")) $("dl").textContent = "Deadline: " + (dl ? fmt(dl) : "-");

  // buttons text
  if ($("lk")) {
    $("lk").textContent = (mta.matchesLocked ? "🔒 Αγώνες κλειδωμένοι (πάτα)" : "🔓 Αγώνες ανοικτοί (πάτα)");
  }
  if ($("startBtn")) {
    $("startBtn").textContent = (mta.contestStarted ? "🟢 Διαγωνισμός ΕΝΕΡΓΟΣ" : "🟡 Κλείδωμα διαγωνισμού (Έναρξη)");
    $("startBtn").disabled = !!mta.contestStarted;
  }
  if ($("lockResultsBtn")) {
    $("lockResultsBtn").textContent = (mta.resultsLocked ? "🔒 Τελικά κλειδωμένα" : "🟡 Κλείδωμα Τελικών");
  }
  if ($("finalWeekBtn")) {
    $("finalWeekBtn").textContent = "🏁 Final Week: " + (mta.finalWeek ? "ΝΑΙ" : "OXI");
  }

  if ($("hint")) {
    $("hint").textContent = mta.resultsLocked
      ? "🔒 Τα τελικά είναι κλειδωμένα."
      : "Βάλε τελικά (σε ON) και πάτα «Κλείδωμα Τελικών» για ασφάλεια. Μετά οι βαθμοί μπαίνουν αυτόματα.";
  }
}

/* =========================
   MAIN RENDER
========================= */
function render() {
  const s = sess();

  // ✅ guard panel
  const okAdmin = isAdm(s);
  if ($("guard")) $("guard").style.display = okAdmin ? "none" : "block";
  if ($("panel")) $("panel").style.display = okAdmin ? "block" : "none";

  renderTop();
  if (!okAdmin) return;

  renderContestPills();
  renderPrize();
  renderMatches();
  renderNextStart();

  // ✅ mirror state to Supabase (debounced)
  queueSync();
}

/* =========================
   LOAD (from localStorage)
========================= */
function loadFromStorage() {
  active = R(K.A, null);
  matches = R(K.M, []);
  if (!Array.isArray(matches)) matches = [];
  render();
}

/* =========================
   LOGOUT
========================= */
async function logout() {
  try { await supabase.auth.signOut(); } catch (e) {}
  localStorage.removeItem(K.S);
  location.replace("login.html");
}

/* =========================
   WIRE EVENTS
========================= */
function wire() {
  // top buttons
  if ($("lo")) $("lo").addEventListener("click", logout);
  if ($("re")) $("re").addEventListener("click", loadFromStorage);

  // left - contest control
  if ($("nc")) $("nc").addEventListener("click", newContest);
  if ($("startBtn")) $("startBtn").addEventListener("click", toggleContestStart);
  if ($("lk")) $("lk").addEventListener("click", toggleMatchesLock);

  // prize / ends
  if ($("ps")) $("ps").addEventListener("click", savePrize);
  if ($("pc")) $("pc").addEventListener("click", clearPrize);
  if ($("es")) $("es").addEventListener("click", saveEnds);
  if ($("ec")) $("ec").addEventListener("click", clearEnds);

  // add match
  if ($("ad")) $("ad").addEventListener("click", addMatch);

  // lock results + next
  if ($("lockResultsBtn")) $("lockResultsBtn").addEventListener("click", lockFinalResults);
  if ($("nx")) $("nx").addEventListener("click", nextRound);
  if ($("finalWeekBtn")) $("finalWeekBtn").addEventListener("click", toggleFinalWeek);

  // right side panels
  if ($("ab")) $("ab").addEventListener("click", activeUsersByContest);
  if ($("ub")) $("ub").addEventListener("click", openUsers);
  if ($("hb")) $("hb").addEventListener("click", openHelp);

  // manual scoring
  if ($("sc")) $("sc").addEventListener("click", calculateScores);

  // next contest start
  if ($("nsSave")) $("nsSave").addEventListener("click", saveNextStart);
  if ($("nsClear")) $("nsClear").addEventListener("click", clearNextStart);
}

/* =========================
   EXPOSE for inline onclick (match cards)
========================= */
window.toggleOff = toggleOff;
window.saveRes = saveRes;

/* =========================
   START
========================= */
wire();
loadFromStorage();