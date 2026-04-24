// DJ Assist — client-side filter/sort UI
const state = {
  tracks: [],
  filter: { q: "", tempo: "all", genre: "all", era: "all", playedOnly: false },
  sort: "popularity",
};

const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);

async function load() {
  const res = await fetch("tracks.json");
  const data = await res.json();
  state.tracks = data.tracks;
  byId("stats").textContent = `${data.track_count} tracks · built ${
    data.generated_at ? data.generated_at.slice(0, 10) : ""
  }`;
  populateGenreFilter();
  populateEraFilter();
  render();
}

function populateGenreFilter() {
  const counts = new Map();
  for (const t of state.tracks) counts.set(t.genre, (counts.get(t.genre) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const sel = byId("genre");
  for (const [g, c] of sorted) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = `${g} (${c})`;
    sel.appendChild(opt);
  }
}

function populateEraFilter() {
  const eras = new Set();
  for (const t of state.tracks) if (t.era) eras.add(t.era);
  const sorted = [...eras].sort();
  const box = byId("era-chips");
  for (const e of sorted) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.value = e;
    btn.textContent = e;
    box.appendChild(btn);
  }
}

function bind() {
  byId("search").addEventListener("input", (e) => {
    state.filter.q = e.target.value.trim().toLowerCase();
    render();
  });
  byId("genre").addEventListener("change", (e) => {
    state.filter.genre = e.target.value;
    render();
  });
  byId("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
  byId("played-only").addEventListener("change", (e) => {
    state.filter.playedOnly = e.target.checked;
    render();
  });

  for (const group of ["tempo-chips", "era-chips"]) {
    byId(group).addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const parent = btn.parentElement;
      parent.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const key = group === "tempo-chips" ? "tempo" : "era";
      state.filter[key] = btn.dataset.value;
      render();
    });
  }

  byId("reset").addEventListener("click", () => {
    state.filter = { q: "", tempo: "all", genre: "all", era: "all", playedOnly: false };
    state.sort = "popularity";
    byId("search").value = "";
    byId("genre").value = "all";
    byId("sort").value = "popularity";
    byId("played-only").checked = false;
    for (const id of ["tempo-chips", "era-chips"]) {
      const chips = byId(id).querySelectorAll(".chip");
      chips.forEach((c) => c.classList.toggle("active", c.dataset.value === "all"));
    }
    render();
  });
}

function applyFilters() {
  const { q, tempo, genre, era, playedOnly } = state.filter;
  return state.tracks.filter((t) => {
    if (tempo !== "all" && t.tempo !== tempo) return false;
    if (genre !== "all" && t.genre !== genre) return false;
    if (era !== "all" && t.era !== era) return false;
    if (playedOnly && !(t.dance_plays > 0)) return false;
    if (q) {
      const hay = `${t.name} ${t.artist}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function applySort(list) {
  const s = state.sort;
  const copy = list.slice();
  const byNum = (k, dir = -1) => (a, b) => {
    const av = a[k] ?? -Infinity, bv = b[k] ?? -Infinity;
    return (av - bv) * dir;
  };
  switch (s) {
    case "popularity":  copy.sort(byNum("popularity", -1)); break;
    case "dance_plays": copy.sort(byNum("dance_plays", -1)); break;
    case "bpm_asc":     copy.sort(byNum("bpm", 1)); break;
    case "bpm_desc":    copy.sort(byNum("bpm", -1)); break;
    case "year_desc":   copy.sort(byNum("year", -1)); break;
    case "year_asc":    copy.sort(byNum("year", 1)); break;
    case "title":       copy.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "artist":      copy.sort((a, b) => (a.artist || "").localeCompare(b.artist || "")); break;
  }
  return copy;
}

function render() {
  const filtered = applySort(applyFilters());
  byId("count").textContent = `${filtered.length.toLocaleString()} tracks`;
  const tbody = document.querySelector("#tracks tbody");
  tbody.innerHTML = "";
  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" class="empty">No tracks match these filters.</td>`;
    // (column count unchanged)
    tbody.appendChild(tr);
    return;
  }
  const frag = document.createDocumentFragment();
  filtered.slice(0, 1000).forEach((t, i) => {
    const tr = document.createElement("tr");
    const pct = Math.max(0, Math.min(100, t.popularity || 0));
    const tempoLabel = t.tempo === "unknown" ? "?" : t.tempo;
    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td class="num">
        <span class="pop-bar"><span style="width:${pct}%"></span></span>${pct.toFixed(0)}
      </td>
      <td>${escapeHtml(t.name)}${t.loved ? ' <span class="badge">♥</span>' : ""}</td>
      <td>${escapeHtml(t.artist || "")}</td>
      <td>${escapeHtml(t.genre || "")}</td>
      <td>${t.era || ""}</td>
      <td class="num">${t.bpm ?? ""}</td>
      <td class="tempo-${t.tempo}">${tempoLabel}</td>
      <td class="num">${t.dance_plays || ""}</td>`;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
  if (filtered.length > 1000) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" class="empty">Showing first 1000 of ${filtered.length}. Refine filters to see more.</td>`;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initFilterToggle() {
  const btn = document.getElementById("filter-toggle");
  const panel = document.getElementById("filters");
  if (!btn || !panel) return;
  const label = btn.querySelector(".filter-toggle-label");
  const setOpen = (open) => {
    panel.classList.toggle("open", open);
    document.body.classList.toggle("filters-open", open);
    btn.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Close" : "Filters";
  };
  btn.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false);
  });
}

function initResizers() {
  const table = document.getElementById("tracks");
  const cols = table.querySelectorAll("colgroup col");
  const ths = table.querySelectorAll("thead th");
  ths.forEach((th, idx) => {
    if (idx === ths.length - 1) return; // no resizer on last column
    const col = cols[idx];
    if (!col) return;
    const handle = document.createElement("div");
    handle.className = "col-resizer";
    th.appendChild(handle);

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = col.offsetWidth || th.offsetWidth;
      handle.classList.add("active");
      document.body.classList.add("col-resizing");

      const onMove = (ev) => {
        const w = Math.max(40, startWidth + (ev.clientX - startX));
        col.style.width = w + "px";
      };
      const onUp = () => {
        handle.classList.remove("active");
        document.body.classList.remove("col-resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        try {
          const widths = [...cols].map((c) => c.style.width || "");
          localStorage.setItem("dj-assist-col-widths", JSON.stringify(widths));
        } catch {}
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });

  // restore saved widths
  try {
    const saved = JSON.parse(localStorage.getItem("dj-assist-col-widths") || "[]");
    saved.forEach((w, i) => {
      if (w && cols[i]) cols[i].style.width = w;
    });
  } catch {}
}

bind();
initResizers();
initFilterToggle();
load().catch((err) => {
  byId("stats").textContent = "Error loading tracks.json";
  console.error(err);
});
