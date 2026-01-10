(() => {
  const STORAGE_KEY = "absence_tracker_v1";
  const STATE_VERSION = 1;

  // Settings
  const SETTINGS_KEY = "absence_tracker_settings_v1";
  const DEFAULT_HOLIDAYS_LIMIT = 25;
  const DEFAULT_RATE = 0;
  const DEFAULT_CURRENCY = "PLN";

  // Paid holiday minutes (per your spec)
  const HOLIDAY_FULL_MIN = 450; // 7h30m
  const HOLIDAY_HALF_MIN = 210; // 3h30m

  const settings = loadSettings();
  const state = loadState();

  /* -----------------------------
   * Settings
   * ----------------------------- */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return {
          holidaysLimit: DEFAULT_HOLIDAYS_LIMIT,
          hourlyRate: DEFAULT_RATE,
          currency: DEFAULT_CURRENCY
        };
      }
      const parsed = JSON.parse(raw);

      const holidaysLimit = normalizeLimit(parsed.holidaysLimit);
      const hourlyRate = normalizeMoney(parsed.hourlyRate);
      const currency = ["PLN", "EUR", "GBP"].includes(parsed.currency) ? parsed.currency : DEFAULT_CURRENCY;

      return {
        holidaysLimit: holidaysLimit ?? DEFAULT_HOLIDAYS_LIMIT,
        hourlyRate: hourlyRate ?? DEFAULT_RATE,
        currency
      };
    } catch {
      return {
        holidaysLimit: DEFAULT_HOLIDAYS_LIMIT,
        hourlyRate: DEFAULT_RATE,
        currency: DEFAULT_CURRENCY
      };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function normalizeLimit(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 2) / 2; // 0.5 steps
  }

  function normalizeMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  /* -----------------------------
   * State
   * ----------------------------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: STATE_VERSION, holidays: [], sickness: [], childcare: [], overtimes: [], hours: [] };

      const parsed = JSON.parse(raw);
      return {
        version: Number(parsed.version || STATE_VERSION),
        holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
        sickness: Array.isArray(parsed.sickness) ? parsed.sickness : [],
        childcare: Array.isArray(parsed.childcare) ? parsed.childcare : [],
        overtimes: Array.isArray(parsed.overtimes) ? parsed.overtimes : [],
        hours: Array.isArray(parsed.hours) ? parsed.hours : []
      };
    } catch {
      return { version: STATE_VERSION, holidays: [], sickness: [], childcare: [], overtimes: [], hours: [] };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nextId(list) {
    const max = list.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
    return max + 1;
  }

  function safeNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* -----------------------------
   * Dates & Time
   * ----------------------------- */
  function fmtDateWithWeekday(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(dateObj);
    return `${d}.${m}.${y} • ${weekday}`;
  }

  function isoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseIsoToLocalDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function enumerateDatesInclusive(fromIso, toIso) {
    const start = parseIsoToLocalDate(fromIso);
    const end = parseIsoToLocalDate(toIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    if (end < start) return [];

    const out = [];
    let cur = new Date(start);
    while (cur <= end) {
      out.push(isoFromDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  // Week is Sunday..Saturday
  function startOfWeekSunday(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const day = x.getDay(); // 0 Sunday
    x.setDate(x.getDate() - day);
    return x;
  }

  function endOfWeekSaturday(d) {
    const s = startOfWeekSunday(d);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  function startOfYear(d) {
    return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  function endOfYear(d) {
    return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
  }

  function minutesFromHHMM(hh, mm) {
    const h = Math.max(0, Math.floor(safeNumber(hh)));
    const m = Math.max(0, Math.floor(safeNumber(mm)));
    return h * 60 + Math.min(59, m);
  }

  function fmtHoursMinutesFromMinutes(totalMin) {
    const min = Math.max(0, Math.round(totalMin));
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  function inRange(iso, fromDate, toDate) {
    const d = parseIsoToLocalDate(iso);
    return d >= fromDate && d <= toDate;
  }

  /* -----------------------------
   * Holidays -> Paid minutes helpers
   * ----------------------------- */
  function holidayPaidMinutesForEntry(entry) {
    // entry.dayValue is expected 1 or 0.5 in this app
    const dv = safeNumber(entry.dayValue);
    if (dv === 1) return HOLIDAY_FULL_MIN;
    if (dv === 0.5) return HOLIDAY_HALF_MIN;

    // fallback (if someone imports odd values):
    // treat >=1 as full days, and fractions as proportion of full day (still not matching your 3h30 rule),
    // so we clamp to spec for 0.5 and 1; otherwise use full-day proportion.
    return Math.round(dv * HOLIDAY_FULL_MIN);
  }

  function sumHolidayMinutesInPeriod(fromDate, toDate) {
    return state.holidays
      .filter(x => inRange(x.date, fromDate, toDate))
      .reduce((acc, x) => acc + holidayPaidMinutesForEntry(x), 0);
  }

  /* -----------------------------
   * Tabs
   * ----------------------------- */
  const tabs = document.querySelectorAll(".tab");
  const panels = {
    holidays: document.getElementById("panel-holidays"),
    sickness: document.getElementById("panel-sickness"),
    childcare: document.getElementById("panel-childcare"),
    overtimes: document.getElementById("panel-overtimes"),
    hours: document.getElementById("panel-hours")
  };

  tabs.forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

  function activateTab(key) {
    tabs.forEach(t => {
      const active = (t.dataset.tab === key);
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== key));
  }

  /* -----------------------------
   * Export / Import / Reset
   * ----------------------------- */
  const exportBtn = document.getElementById("export-json");
  const importBtn = document.getElementById("import-json");
  const resetAllBtn = document.getElementById("reset-all");
  const importFile = document.getElementById("import-file");

  exportBtn.addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      ...state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const ts = new Date();
    const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `absence-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // settings optional
      if (parsed.settings && typeof parsed.settings === "object") {
        const hl = normalizeLimit(parsed.settings.holidaysLimit);
        const rate = normalizeMoney(parsed.settings.hourlyRate);
        const cur = ["PLN", "EUR", "GBP"].includes(parsed.settings.currency) ? parsed.settings.currency : null;

        if (hl !== null) settings.holidaysLimit = hl;
        if (rate !== null) settings.hourlyRate = rate;
        if (cur) settings.currency = cur;
        saveSettings();
      }

      state.version = Number(parsed.version || STATE_VERSION);
      state.holidays = normalizeAbsenceList(Array.isArray(parsed.holidays) ? parsed.holidays : []);
      state.sickness = normalizeAbsenceList(Array.isArray(parsed.sickness) ? parsed.sickness : []);
      state.childcare = normalizeAbsenceList(Array.isArray(parsed.childcare) ? parsed.childcare : []);

      state.overtimes = normalizeTimeList(Array.isArray(parsed.overtimes) ? parsed.overtimes : [], "overtime");
      state.hours = normalizeTimeList(Array.isArray(parsed.hours) ? parsed.hours : [], "hours");

      saveState();
      renderAll();
      alert("Import OK. Dane zostały wczytane.");
    } catch {
      alert("Nie udało się zaimportować pliku. Sprawdź, czy to poprawny JSON z eksportu.");
    }
  });

  resetAllBtn.addEventListener("click", () => {
    if (!confirm("Na pewno usunąć WSZYSTKIE dane (Holidays, Sickness, Child care, Overtimes, Hours) + ustawienia?")) return;
    state.holidays = [];
    state.sickness = [];
    state.childcare = [];
    state.overtimes = [];
    state.hours = [];
    settings.holidaysLimit = DEFAULT_HOLIDAYS_LIMIT;
    settings.hourlyRate = DEFAULT_RATE;
    settings.currency = DEFAULT_CURRENCY;
    saveSettings();
    saveState();
    renderAll();
  });

  function normalizeAbsenceList(list) {
    const out = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      if (!item.date) continue;

      const dayValue = safeNumber(item.dayValue) || 1;
      out.push({
        id: Number(item.id || 0) || 0,
        date: String(item.date),
        dayValue,
        dayType: item.dayType || (dayValue === 1 ? "Full day" : "Half day"),
        note: item.note ? String(item.note) : "",
        cert: item.cert ? String(item.cert) : "",
        contact: item.contact ? String(item.contact) : "",
        child: item.child ? String(item.child) : "",
        reason: item.reason ? String(item.reason) : ""
      });
    }

    let max = out.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
    for (const x of out) {
      if (!x.id || x.id <= 0) {
        max += 1;
        x.id = max;
      }
    }
    return out;
  }

  function normalizeTimeList(list, kind) {
    const out = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      if (!item.date) continue;

      const minutes = Math.max(0, Math.round(safeNumber(item.minutes)));
      const multRaw = kind === "overtime" ? safeNumber(item.multiplier) : 1;
      const multiplier = kind === "overtime" && multRaw >= 1 ? multRaw : 1;

      out.push({
        id: Number(item.id || 0) || 0,
        date: String(item.date),
        minutes,
        multiplier,
        note: item.note ? String(item.note) : ""
      });
    }

    let max = out.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
    for (const x of out) {
      if (!x.id || x.id <= 0) {
        max += 1;
        x.id = max;
      }
    }
    return out;
  }

  /* -----------------------------
   * Helpers for add
   * ----------------------------- */
  function addSingle(listKey, entry, uniqueByDate = true) {
    const list = state[listKey];
    if (uniqueByDate && list.some(x => x.date === entry.date)) {
      return { ok: false, msg: `Ten dzień (${entry.date}) już istnieje w tej zakładce.` };
    }
    list.push({ id: nextId(list), ...entry });
    return { ok: true };
  }

  function addRange(listKey, fromIso, toIso, entryBuilder, uniqueByDate = true) {
    const dates = enumerateDatesInclusive(fromIso, toIso);
    if (dates.length === 0) return { ok: false, msg: "Niepoprawny zakres. Upewnij się, że 'od' <= 'do'." };

    const list = state[listKey];
    const existing = new Set(uniqueByDate ? list.map(x => x.date) : []);
    const toAdd = uniqueByDate ? dates.filter(d => !existing.has(d)) : dates;

    if (uniqueByDate && toAdd.length === 0) {
      return { ok: false, msg: "Wszystkie dni z tego zakresu już istnieją w tej zakładce." };
    }

    for (const d of toAdd) {
      list.push({ id: nextId(list), ...entryBuilder(d) });
    }

    return { ok: true, added: toAdd.length, skipped: dates.length - toAdd.length };
  }

  /* -----------------------------
   * HOLIDAYS
   * ----------------------------- */
  const hDate = document.getElementById("h-date");
  const hType = document.getElementById("h-type");
  const hNote = document.getElementById("h-note");
  const hAdd = document.getElementById("h-add");
  const hClear = document.getElementById("h-clear");
  const hList = document.getElementById("h-list");
  const hFrom = document.getElementById("h-from");
  const hTo = document.getElementById("h-to");
  const hRangeType = document.getElementById("h-range-type");
  const hAddRange = document.getElementById("h-add-range");
  const hLimitInput = document.getElementById("h-limit-input");
  const hTakenEl = document.getElementById("h-taken");
  const hLeftEl = document.getElementById("h-left");

  if (hLimitInput) {
    hLimitInput.value = String(settings.holidaysLimit);
    hLimitInput.addEventListener("change", () => {
      const normalized = normalizeLimit(hLimitInput.value);
      if (normalized === null) {
        alert("Podaj poprawną liczbę dni (>= 0).");
        hLimitInput.value = String(settings.holidaysLimit);
        return;
      }
      settings.holidaysLimit = normalized;
      saveSettings();
      renderHolidays();
      renderHours(); // IMPORTANT: holidays affect paid hours
    });
  }

  hAdd.addEventListener("click", () => {
    const date = hDate.value;
    const dayValue = Number(hType.value);
    const note = (hNote.value || "").trim();
    if (!date) { alert("Wybierz datę."); return; }

    const taken = state.holidays.reduce((acc, it) => acc + safeNumber(it.dayValue), 0);
    if (settings.holidaysLimit - (taken + dayValue) < 0) {
      alert(`Przekraczasz limit Holidays (${settings.holidaysLimit} dni).`);
      return;
    }

    const res = addSingle("holidays", {
      date,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      note
    }, true);

    if (!res.ok) { alert(res.msg); return; }
    saveState();
    renderAll();

    hDate.value = "";
    hNote.value = "";
    hType.value = "1";
  });

  hAddRange.addEventListener("click", () => {
    const fromIso = hFrom.value;
    const toIso = hTo.value;
    const dayValue = Number(hRangeType.value);
    const note = (hNote.value || "").trim();
    if (!fromIso || !toIso) { alert("Uzupełnij daty 'od' i 'do'."); return; }

    const dates = enumerateDatesInclusive(fromIso, toIso);
    if (dates.length === 0) { alert("Niepoprawny zakres (od <= do)."); return; }

    const existing = new Set(state.holidays.map(x => x.date));
    const toAddCount = dates.filter(d => !existing.has(d)).length;

    const taken = state.holidays.reduce((acc, it) => acc + safeNumber(it.dayValue), 0);
    const wouldAdd = toAddCount * dayValue;
    if (settings.holidaysLimit - (taken + wouldAdd) < 0) {
      alert(`Zakres przekroczy limit Holidays (${settings.holidaysLimit} dni).`);
      return;
    }

    const res = addRange("holidays", fromIso, toIso, (d) => ({
      date: d,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      note
    }), true);

    if (!res.ok) { alert(res.msg); return; }

    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    hFrom.value = "";
    hTo.value = "";
    hRangeType.value = "1";
  });

  hClear.addEventListener("click", () => {
    if (!confirm("Na pewno wyczyścić wszystkie wpisy Holidays?")) return;
    state.holidays = [];
    saveState();
    renderAll();
  });

  function renderHolidays() {
    if (hLimitInput) hLimitInput.value = String(settings.holidaysLimit);

    const taken = state.holidays.reduce((acc, it) => acc + safeNumber(it.dayValue), 0);
    const left = settings.holidaysLimit - taken;

    hTakenEl.textContent = (taken % 1 === 0) ? taken.toFixed(0) : taken.toFixed(1);
    hLeftEl.textContent = (left % 1 === 0) ? left.toFixed(0) : left.toFixed(1);

    hLeftEl.classList.toggle("bad", left <= 2);
    hLeftEl.classList.toggle("good", left > 2);

    const list = [...state.holidays].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    hList.innerHTML = "";

    if (list.length === 0) {
      hList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów. Dodaj dzień lub zakres.</div></div>`;
      return;
    }

    list.forEach(item => {
      const el = document.createElement("div");
      el.className = "item";
      const paidMin = holidayPaidMinutesForEntry(item);

      el.innerHTML = `
        <div class="item-top">
          <div class="item-title">ID ${item.id} • ${fmtDateWithWeekday(item.date)}</div>
          <div class="item-badge">${item.dayType}</div>
        </div>
        <div class="item-meta">
          <div><strong>Dni:</strong> ${item.dayValue}</div>
          <div><strong>Paid hours:</strong> ${fmtHoursMinutesFromMinutes(paidMin)}</div>
          ${item.note ? `<div><strong>Notatka:</strong> ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="btn mini danger" data-id="${item.id}">Usuń</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        state.holidays = state.holidays.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });
      hList.appendChild(el);
    });
  }

  /* -----------------------------
   * SICKNESS
   * ----------------------------- */
  const sDate = document.getElementById("s-date");
  const sType = document.getElementById("s-type");
  const sCert = document.getElementById("s-cert");
  const sContact = document.getElementById("s-contact");
  const sNote = document.getElementById("s-note");
  const sAdd = document.getElementById("s-add");
  const sClear = document.getElementById("s-clear");
  const sList = document.getElementById("s-list");
  const sFrom = document.getElementById("s-from");
  const sTo = document.getElementById("s-to");
  const sRangeType = document.getElementById("s-range-type");
  const sAddRange = document.getElementById("s-add-range");
  const sCountEl = document.getElementById("s-count");
  const sTotalEl = document.getElementById("s-total");
  const sLastEl = document.getElementById("s-last");

  sAdd.addEventListener("click", () => {
    const date = sDate.value;
    const dayValue = Number(sType.value);
    if (!date) { alert("Wybierz datę."); return; }

    const res = addSingle("sickness", {
      date,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      cert: sCert.value,
      contact: (sContact.value || "").trim(),
      note: (sNote.value || "").trim()
    }, true);

    if (!res.ok) { alert(res.msg); return; }
    saveState();
    renderAll();

    sDate.value = "";
    sType.value = "1";
    sCert.value = "Nie";
    sContact.value = "";
    sNote.value = "";
  });

  sAddRange.addEventListener("click", () => {
    const fromIso = sFrom.value;
    const toIso = sTo.value;
    const dayValue = Number(sRangeType.value);
    if (!fromIso || !toIso) { alert("Uzupełnij daty 'od' i 'do'."); return; }

    const res = addRange("sickness", fromIso, toIso, (d) => ({
      date: d,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      cert: sCert.value,
      contact: (sContact.value || "").trim(),
      note: (sNote.value || "").trim()
    }), true);

    if (!res.ok) { alert(res.msg); return; }
    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    sFrom.value = "";
    sTo.value = "";
    sRangeType.value = "1";
  });

  sClear.addEventListener("click", () => {
    if (!confirm("Na pewno wyczyścić wszystkie wpisy Sickness?")) return;
    state.sickness = [];
    saveState();
    renderAll();
  });

  function renderSickness() {
    const total = state.sickness.reduce((acc, it) => acc + safeNumber(it.dayValue), 0);
    const list = [...state.sickness].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    sCountEl.textContent = String(list.length);
    sTotalEl.textContent = (total % 1 === 0) ? total.toFixed(0) : total.toFixed(1);
    sLastEl.textContent = list.length ? fmtDateWithWeekday(list[list.length - 1].date) : "—";

    sList.innerHTML = "";
    if (list.length === 0) {
      sList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów. Dodaj dzień lub zakres.</div></div>`;
      return;
    }

    list.forEach(item => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item-top">
          <div class="item-title">ID ${item.id} • ${fmtDateWithWeekday(item.date)}</div>
          <div class="item-badge">${item.dayType}</div>
        </div>
        <div class="item-meta">
          <div><strong>Dni:</strong> ${item.dayValue}</div>
          <div><strong>Zwolnienie:</strong> ${escapeHtml(item.cert || "Nie")}</div>
          ${item.contact ? `<div><strong>Info:</strong> ${escapeHtml(item.contact)}</div>` : ""}
          ${item.note ? `<div><strong>Notatka:</strong> ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="btn mini danger" data-id="${item.id}">Usuń</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        state.sickness = state.sickness.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });
      sList.appendChild(el);
    });
  }

  /* -----------------------------
   * CHILDCARE
   * ----------------------------- */
  const cDate = document.getElementById("c-date");
  const cType = document.getElementById("c-type");
  const cChild = document.getElementById("c-child");
  const cReason = document.getElementById("c-reason");
  const cNote = document.getElementById("c-note");
  const cAdd = document.getElementById("c-add");
  const cClear = document.getElementById("c-clear");
  const cList = document.getElementById("c-list");
  const cFrom = document.getElementById("c-from");
  const cTo = document.getElementById("c-to");
  const cRangeType = document.getElementById("c-range-type");
  const cAddRange = document.getElementById("c-add-range");
  const cCountEl = document.getElementById("c-count");
  const cTotalEl = document.getElementById("c-total");
  const cLastEl = document.getElementById("c-last");

  cAdd.addEventListener("click", () => {
    const date = cDate.value;
    const dayValue = Number(cType.value);
    if (!date) { alert("Wybierz datę."); return; }

    const res = addSingle("childcare", {
      date,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      child: (cChild.value || "").trim(),
      reason: cReason.value,
      note: (cNote.value || "").trim()
    }, true);

    if (!res.ok) { alert(res.msg); return; }
    saveState();
    renderAll();

    cDate.value = "";
    cType.value = "1";
    cChild.value = "";
    cReason.value = "Choroba dziecka";
    cNote.value = "";
  });

  cAddRange.addEventListener("click", () => {
    const fromIso = cFrom.value;
    const toIso = cTo.value;
    const dayValue = Number(cRangeType.value);
    if (!fromIso || !toIso) { alert("Uzupełnij daty 'od' i 'do'."); return; }

    const res = addRange("childcare", fromIso, toIso, (d) => ({
      date: d,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      child: (cChild.value || "").trim(),
      reason: cReason.value,
      note: (cNote.value || "").trim()
    }), true);

    if (!res.ok) { alert(res.msg); return; }
    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    cFrom.value = "";
    cTo.value = "";
    cRangeType.value = "1";
  });

  cClear.addEventListener("click", () => {
    if (!confirm("Na pewno wyczyścić wszystkie wpisy Child care?")) return;
    state.childcare = [];
    saveState();
    renderAll();
  });

  function renderChildcare() {
    const total = state.childcare.reduce((acc, it) => acc + safeNumber(it.dayValue), 0);
    const list = [...state.childcare].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    cCountEl.textContent = String(list.length);
    cTotalEl.textContent = (total % 1 === 0) ? total.toFixed(0) : total.toFixed(1);
    cLastEl.textContent = list.length ? fmtDateWithWeekday(list[list.length - 1].date) : "—";

    cList.innerHTML = "";
    if (list.length === 0) {
      cList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów. Dodaj dzień lub zakres.</div></div>`;
      return;
    }

    list.forEach(item => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item-top">
          <div class="item-title">ID ${item.id} • ${fmtDateWithWeekday(item.date)}</div>
          <div class="item-badge">${item.dayType}</div>
        </div>
        <div class="item-meta">
          <div><strong>Dni:</strong> ${item.dayValue}</div>
          ${item.child ? `<div><strong>Dziecko:</strong> ${escapeHtml(item.child)}</div>` : ""}
          <div><strong>Powód:</strong> ${escapeHtml(item.reason || "—")}</div>
          ${item.note ? `<div><strong>Notatka:</strong> ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="btn mini danger" data-id="${item.id}">Usuń</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        state.childcare = state.childcare.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });
      cList.appendChild(el);
    });
  }

  /* -----------------------------
   * OVERTIMES
   * ----------------------------- */
  const otDate = document.getElementById("ot-date");
  const otMult = document.getElementById("ot-mult");
  const otHH = document.getElementById("ot-hh");
  const otMM = document.getElementById("ot-mm");
  const otAdd = document.getElementById("ot-add");
  const otFrom = document.getElementById("ot-from");
  const otTo = document.getElementById("ot-to");
  const otAddRange = document.getElementById("ot-add-range");
  const otClear = document.getElementById("ot-clear");
  const otList = document.getElementById("ot-list");

  const otWeekEl = document.getElementById("ot-week");
  const otMonthEl = document.getElementById("ot-month");
  const otYearEl = document.getElementById("ot-year");

  const otListMini = document.getElementById("ot-list-mini");

  otAdd.addEventListener("click", () => {
    const date = otDate.value;
    if (!date) { alert("Wybierz datę."); return; }

    const minutes = minutesFromHHMM(otHH.value, otMM.value);
    if (minutes <= 0) { alert("Wpisz czas nadgodzin (większy niż 0)."); return; }

    const mult = safeNumber(otMult.value);
    if (!Number.isFinite(mult) || mult < 1) { alert("Mnożnik musi być >= 1."); return; }

    const res = addSingle("overtimes", { date, minutes, multiplier: mult }, true);
    if (!res.ok) { alert(res.msg); return; }

    saveState();
    renderAll();

    otDate.value = "";
    otHH.value = "0";
    otMM.value = "0";
  });

  otAddRange.addEventListener("click", () => {
    const fromIso = otFrom.value;
    const toIso = otTo.value;
    if (!fromIso || !toIso) { alert("Uzupełnij daty 'od' i 'do'."); return; }

    const minutes = minutesFromHHMM(otHH.value, otMM.value);
    if (minutes <= 0) { alert("Wpisz czas nadgodzin (większy niż 0)."); return; }

    const mult = safeNumber(otMult.value);
    if (!Number.isFinite(mult) || mult < 1) { alert("Mnożnik musi być >= 1."); return; }

    const res = addRange("overtimes", fromIso, toIso, (d) => ({ date: d, minutes, multiplier: mult }), true);
    if (!res.ok) { alert(res.msg); return; }

    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    otFrom.value = "";
    otTo.value = "";
  });

  otClear.addEventListener("click", () => {
    if (!confirm("Na pewno wyczyścić wszystkie wpisy Overtimes?")) return;
    state.overtimes = [];
    saveState();
    renderAll();
  });

  function renderOvertimes() {
    const list = [...state.overtimes].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    otList.innerHTML = "";

    if (list.length === 0) {
      otList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów. Dodaj dzień lub zakres.</div></div>`;
    } else {
      list.forEach(item => {
        const el = document.createElement("div");
        el.className = "item";
        el.innerHTML = `
          <div class="item-top">
            <div class="item-title">ID ${item.id} • ${fmtDateWithWeekday(item.date)}</div>
            <div class="item-badge">x${item.multiplier}</div>
          </div>
          <div class="item-meta">
            <div><strong>Czas:</strong> ${fmtHoursMinutesFromMinutes(item.minutes)}</div>
          </div>
          <div class="item-actions">
            <button class="btn mini danger" data-id="${item.id}">Usuń</button>
          </div>
        `;
        el.querySelector("button").addEventListener("click", () => {
          state.overtimes = state.overtimes.filter(x => x.id !== item.id);
          saveState();
          renderAll();
        });
        otList.appendChild(el);
      });
    }

    if (otListMini) {
      otListMini.innerHTML = "";
      if (list.length === 0) {
        otListMini.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów.</div></div>`;
      } else {
        list.slice(-30).forEach(item => {
          const el = document.createElement("div");
          el.className = "item";
          el.innerHTML = `
            <div class="item-top">
              <div class="item-title">ID ${item.id} • ${fmtDateWithWeekday(item.date)}</div>
              <div class="item-badge">x${item.multiplier}</div>
            </div>
            <div class="item-meta"><strong>${fmtHoursMinutesFromMinutes(item.minutes)}</strong></div>
          `;
          otListMini.appendChild(el);
        });
      }
    }

    const now = new Date();
    const wFrom = startOfWeekSunday(now);
    const wTo = endOfWeekSaturday(now);
    const mFrom = startOfMonth(now);
    const mTo = endOfMonth(now);
    const yFrom = startOfYear(now);
    const yTo = endOfYear(now);

    const weekMin = state.overtimes.filter(x => inRange(x.date, wFrom, wTo)).reduce((a, x) => a + safeNumber(x.minutes), 0);
    const monthMin = state.overtimes.filter(x => inRange(x.date, mFrom, mTo)).reduce((a, x) => a + safeNumber(x.minutes), 0);
    const yearMin = state.overtimes.filter(x => inRange(x.date, yFrom, yTo)).reduce((a, x) => a + safeNumber(x.minutes), 0);

    otWeekEl.textContent = fmtHoursMinutesFromMinutes(weekMin);
    otMonthEl.textContent = fmtHoursMinutesFromMinutes(monthMin);
    otYearEl.textContent = fmtHoursMinutesFromMinutes(yearMin);
  }

  /* -----------------------------
   * HOURS
   * ----------------------------- */
  const hrDate = document.getElementById("hr-date");
  const hrNote = document.getElementById("hr-note");
  const hrHH = document.getElementById("hr-hh");
  const hrMM = document.getElementById("hr-mm");
  const hrAdd = document.getElementById("hr-add");
  const hrFrom = document.getElementById("hr-from");
  const hrTo = document.getElementById("hr-to");
  const hrAddRange = document.getElementById("hr-add-range");
  const hrClear = document.getElementById("hr-clear");

  const hrWeekEl = document.getElementById("hr-week");
  const hrMonthEl = document.getElementById("hr-month");
  const hrYearEl = document.getElementById("hr-year");

  const hrWeeklyList = document.getElementById("hr-weekly-list");
  const hrList = document.getElementById("hr-list");

  const payRate = document.getElementById("pay-rate");
  const payCur = document.getElementById("pay-cur");
  const payWeek = document.getElementById("pay-week");
  const payMonth = document.getElementById("pay-month");
  const payYear = document.getElementById("pay-year");

  if (payRate) {
    payRate.value = String(settings.hourlyRate || "");
    payRate.addEventListener("change", () => {
      const v = normalizeMoney(payRate.value);
      if (v === null) {
        alert("Podaj poprawną stawkę (>= 0).");
        payRate.value = String(settings.hourlyRate || "");
        return;
      }
      settings.hourlyRate = v;
      saveSettings();
      renderHours();
    });
  }

  if (payCur) {
    payCur.value = settings.currency;
    payCur.addEventListener("change", () => {
      settings.currency = payCur.value;
      saveSettings();
      renderHours();
    });
  }

  hrAdd.addEventListener("click", () => {
    const date = hrDate.value;
    if (!date) { alert("Wybierz datę."); return; }

    const minutes = minutesFromHHMM(hrHH.value, hrMM.value);
    if (minutes < 0) { alert("Nieprawidłowy czas."); return; }

    const res = addSingle("hours", {
      date,
      minutes,
      multiplier: 1,
      note: (hrNote.value || "").trim()
    }, true);

    if (!res.ok) { alert(res.msg); return; }

    saveState();
    renderAll();

    hrDate.value = "";
    hrNote.value = "";
  });

  hrAddRange.addEventListener("click", () => {
    const fromIso = hrFrom.value;
    const toIso = hrTo.value;
    if (!fromIso || !toIso) { alert("Uzupełnij daty 'od' i 'do'."); return; }

    const minutes = minutesFromHHMM(hrHH.value, hrMM.value);
    if (minutes < 0) { alert("Nieprawidłowy czas."); return; }

    const note = (hrNote.value || "").trim();

    const res = addRange("hours", fromIso, toIso, (d) => ({
      date: d,
      minutes,
      multiplier: 1,
      note
    }), true);

    if (!res.ok) { alert(res.msg); return; }

    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    hrFrom.value = "";
    hrTo.value = "";
  });

  hrClear.addEventListener("click", () => {
    if (!confirm("Na pewno wyczyścić wszystkie wpisy Hours?")) return;
    state.hours = [];
    saveState();
    renderAll();
  });

  function sumMinutesInPeriod(list, fromDate, toDate) {
    return list.filter(x => inRange(x.date, fromDate, toDate)).reduce((a, x) => a + safeNumber(x.minutes), 0);
  }

  function sumOvertimeEarningsInPeriod(fromDate, toDate, rate) {
    const items = state.overtimes.filter(x => inRange(x.date, fromDate, toDate));
    return items.reduce((acc, x) => {
      const hours = safeNumber(x.minutes) / 60;
      const mult = safeNumber(x.multiplier) >= 1 ? safeNumber(x.multiplier) : 1;
      return acc + (hours * rate * mult);
    }, 0);
  }

  function sumOvertimeMinutesInPeriod(fromDate, toDate) {
    return state.overtimes.filter(x => inRange(x.date, fromDate, toDate)).reduce((a, x) => a + safeNumber(x.minutes), 0);
  }

  function renderHours() {
    if (payRate) payRate.value = String(settings.hourlyRate || "");
    if (payCur) payCur.value = settings.currency;

    const now = new Date();
    const wFrom = startOfWeekSunday(now);
    const wTo = endOfWeekSaturday(now);
    const mFrom = startOfMonth(now);
    const mTo = endOfMonth(now);
    const yFrom = startOfYear(now);
    const yTo = endOfYear(now);

    const regWeekMin = sumMinutesInPeriod(state.hours, wFrom, wTo);
    const regMonthMin = sumMinutesInPeriod(state.hours, mFrom, mTo);
    const regYearMin = sumMinutesInPeriod(state.hours, yFrom, yTo);

    const otWeekMin = sumOvertimeMinutesInPeriod(wFrom, wTo);
    const otMonthMin = sumOvertimeMinutesInPeriod(mFrom, mTo);
    const otYearMin = sumOvertimeMinutesInPeriod(yFrom, yTo);

    // Holidays paid minutes
    const holWeekMin = sumHolidayMinutesInPeriod(wFrom, wTo);
    const holMonthMin = sumHolidayMinutesInPeriod(mFrom, mTo);
    const holYearMin = sumHolidayMinutesInPeriod(yFrom, yTo);

    // Display totals: regular + holidays (paid) + overtime
    hrWeekEl.textContent = fmtHoursMinutesFromMinutes(regWeekMin + holWeekMin + otWeekMin);
    hrMonthEl.textContent = fmtHoursMinutesFromMinutes(regMonthMin + holMonthMin + otMonthMin);
    hrYearEl.textContent = fmtHoursMinutesFromMinutes(regYearMin + holYearMin + otYearMin);

    // Calculator
    const rate = safeNumber(settings.hourlyRate);
    const cur = settings.currency;

    const regWeekPay = (regWeekMin / 60) * rate;
    const regMonthPay = (regMonthMin / 60) * rate;
    const regYearPay = (regYearMin / 60) * rate;

    const holWeekPay = (holWeekMin / 60) * rate;
    const holMonthPay = (holMonthMin / 60) * rate;
    const holYearPay = (holYearMin / 60) * rate;

    const otWeekPay = sumOvertimeEarningsInPeriod(wFrom, wTo, rate);
    const otMonthPay = sumOvertimeEarningsInPeriod(mFrom, mTo, rate);
    const otYearPay = sumOvertimeEarningsInPeriod(yFrom, yTo, rate);

    const fmtMoney = (v) => `${(Math.round(v * 100) / 100).toFixed(2)} ${cur}`;

    payWeek.textContent = fmtMoney(regWeekPay + holWeekPay + otWeekPay);
    payMonth.textContent = fmtMoney(regMonthPay + holMonthPay + otMonthPay);
    payYear.textContent = fmtMoney(regYearPay + holYearPay + otYearPay);

    renderWeeklyOverview();
    renderHoursDailyList();
  }

  function weekKeyForDateIso(iso) {
    const d = parseIsoToLocalDate(iso);
    const s = startOfWeekSunday(d);
    return isoFromDate(s);
  }

  function renderWeeklyOverview() {
    const map = new Map(); // startISO -> totals
    const rate = safeNumber(settings.hourlyRate);

    function ensureWeek(startIso) {
      if (map.has(startIso)) return map.get(startIso);
      const start = parseIsoToLocalDate(startIso);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      const obj = {
        startIso,
        endIso: isoFromDate(end),
        regMin: 0,
        holMin: 0,
        otMin: 0,
        otPay: 0,
        regPay: 0,
        holPay: 0
      };
      map.set(startIso, obj);
      return obj;
    }

    // Regular hours
    for (const it of state.hours) {
      const wk = weekKeyForDateIso(it.date);
      const w = ensureWeek(wk);
      w.regMin += safeNumber(it.minutes);
    }

    // Holidays (paid)
    for (const it of state.holidays) {
      const wk = weekKeyForDateIso(it.date);
      const w = ensureWeek(wk);
      w.holMin += holidayPaidMinutesForEntry(it);
    }

    // Overtimes
    for (const it of state.overtimes) {
      const wk = weekKeyForDateIso(it.date);
      const w = ensureWeek(wk);
      w.otMin += safeNumber(it.minutes);

      const hours = safeNumber(it.minutes) / 60;
      const mult = safeNumber(it.multiplier) >= 1 ? safeNumber(it.multiplier) : 1;
      w.otPay += hours * rate * mult;
    }

    // derive pay
    for (const w of map.values()) {
      w.regPay = (w.regMin / 60) * rate;
      w.holPay = (w.holMin / 60) * rate;
    }

    const cur = settings.currency;
    const fmtMoney = (v) => `${(Math.round(v * 100) / 100).toFixed(2)} ${cur}`;

    const weeks = Array.from(map.values()).sort((a, b) => (b.startIso).localeCompare(a.startIso));

    hrWeeklyList.innerHTML = "";
    if (weeks.length === 0) {
      hrWeeklyList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów. Dodaj godziny w Hours, Holidays lub nadgodziny w Overtimes.</div></div>`;
      return;
    }

    weeks.slice(0, 16).forEach(w => {
      const totalMin = w.regMin + w.holMin + w.otMin;
      const totalPay = w.regPay + w.holPay + w.otPay;

      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item-top">
          <div class="item-title">${fmtDateWithWeekday(w.startIso)} → ${fmtDateWithWeekday(w.endIso)}</div>
          <div class="item-badge">${fmtHoursMinutesFromMinutes(totalMin)}</div>
        </div>
        <div class="item-meta">
          <div><strong>Regular:</strong> ${fmtHoursMinutesFromMinutes(w.regMin)}</div>
          <div><strong>Holidays (paid):</strong> ${fmtHoursMinutesFromMinutes(w.holMin)}</div>
          <div><strong>Overtime:</strong> ${fmtHoursMinutesFromMinutes(w.otMin)}</div>
          <div><strong>Zarobek:</strong> ${fmtMoney(totalPay)}</div>
        </div>
      `;
      hrWeeklyList.appendChild(el);
    });
  }

  function renderHoursDailyList() {
    const list = [...state.hours].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    hrList.innerHTML = "";

    if (list.length === 0) {
      hrList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów.</div></div>`;
      return;
    }

    list.forEach(item => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item-top">
          <div class="item-title">ID ${item.id} • ${fmtDateWithWeekday(item.date)}</div>
          <div class="item-badge">${fmtHoursMinutesFromMinutes(item.minutes)}</div>
        </div>
        <div class="item-meta">
          ${item.note ? `<div><strong>Notatka:</strong> ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="btn mini danger" data-id="${item.id}">Usuń</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        state.hours = state.hours.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });
      hrList.appendChild(el);
    });
  }

  /* -----------------------------
   * Render All
   * ----------------------------- */
  function renderAll() {
    renderHolidays();
    renderSickness();
    renderChildcare();
    renderOvertimes();
    renderHours();
  }

  // Initial render
  renderAll();

  // SW register
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
})();
