import { requireAdmin, logout } from "./auth.js";

(async () => {
  const ok = await requireAdmin();
  if (!ok) return;

  const btn = document.getElementById("logoutBtn");
  if (btn) btn.addEventListener("click", logout);
})();