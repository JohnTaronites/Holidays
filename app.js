// Seb’s Absence Tracker
(() => {
  const STORAGE_KEY = "absence_tracker_v1";
  const STATE_VERSION = 1;
  const SETTINGS_KEY = "absence_tracker_settings_v1";
  const DEFAULT_HOLIDAYS_LIMIT = 25;
  const state = loadState();

  function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(!raw) return { holidaysLimit: DEFAULT_HOLIDAYS_LIMIT };
    const parsed = JSON.parse(raw);
    const limit = Number(parsed.holidaysLimit);
    return {
      holidaysLimit: Number.isFinite(limit) && limit >= 0 ? limit : DEFAULT_HOLIDAYS_LIMIT
    };
  }catch{
    return { holidaysLimit: DEFAULT_HOLIDAYS_LIMIT };
  }
}

function saveSettings(){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// pozwala na .5 kroki, ale blokuje NaN/ujemne
function normalizeLimit(v){
  const n = Number(v);
  if(!Number.isFinite(n) || n < 0) return null;
  // zaokrąglamy do 0.5 (żeby pasowało do Half day)
  return Math.round(n * 2) / 2;
}

const settings = loadSettings();
  
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { version: STATE_VERSION, holidays: [], sickness: [], childcare: [] };
      const parsed = JSON.parse(raw);
      return {
        version: Number(parsed.version || STATE_VERSION),
        holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
        sickness: Array.isArray(parsed.sickness) ? parsed.sickness : [],
        childcare: Array.isArray(parsed.childcare) ? parsed.childcare : []
      };
    }catch(e){
      return { version: STATE_VERSION, holidays: [], sickness: [], childcare: [] };
    }
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nextId(list){
    const max = list.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
    return max + 1;
  }

  function safeNumber(x){
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function sumDays(list){
    return list.reduce((acc, item) => acc + safeNumber(item.dayValue), 0);
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function fmtDateWithWeekday(iso){
    if(!iso) return "—";
    const [y,m,d] = iso.split("-");
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(dateObj);
    return `${d}.${m}.${y} • ${weekday}`;
  }

  function isoFromDate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function enumerateDatesInclusive(fromIso, toIso){
    const [fy,fm,fd] = fromIso.split("-").map(Number);
    const [ty,tm,td] = toIso.split("-").map(Number);
    const start = new Date(fy, fm-1, fd);
    const end = new Date(ty, tm-1, td);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    if (end < start) return [];

    const out = [];
    let cur = new Date(start);
    while(cur <= end){
      out.push(isoFromDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /* Tabs */
  const tabs = document.querySelectorAll(".tab");
  const panels = {
    holidays: document.getElementById("panel-holidays"),
    sickness: document.getElementById("panel-sickness"),
    childcare: document.getElementById("panel-childcare")
  };

  tabs.forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

  function activateTab(key){
    tabs.forEach(t => {
      const active = (t.dataset.tab === key);
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== key));
  }

  /* Export / Import */
  const exportBtn = document.getElementById("export-json");
  const importBtn = document.getElementById("import-json");
  const resetAllBtn = document.getElementById("reset-all");
  const importFile = document.getElementById("import-file");

  exportBtn.addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), ...state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const ts = new Date();
    const stamp = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,"0")}-${String(ts.getDate()).padStart(2,"0")}`;
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
    if(!file) return;

    try{
      const text = await file.text();
      const parsed = JSON.parse(text);

      const next = {
        version: Number(parsed.version || STATE_VERSION),
        holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
        sickness: Array.isArray(parsed.sickness) ? parsed.sickness : [],
        childcare: Array.isArray(parsed.childcare) ? parsed.childcare : []
      };

      next.holidays = normalizeList(next.holidays);
      next.sickness = normalizeList(next.sickness);
      next.childcare = normalizeList(next.childcare);

      state.version = next.version;
      state.holidays = next.holidays;
      state.sickness = next.sickness;
      state.childcare = next.childcare;

      saveState();
      renderAll();
      alert("Import OK. Dane zostały wczytane.");
    }catch(e){
      alert("Nie udało się zaimportować pliku. Sprawdź, czy to poprawny JSON z eksportu.");
    }
  });

  resetAllBtn.addEventListener("click", () => {
    if(!confirm("Na pewno usunąć WSZYSTKIE dane (Holidays, Sickness, Child care)?")) return;
    state.holidays = [];
    state.sickness = [];
    state.childcare = [];
    saveState();
    renderAll();
  });

  function normalizeList(list){
    const out = [];
    for(const item of list){
      if(!item || typeof item !== "object") continue;
      if(!item.date) continue;

      const dayValue = safeNumber(item.dayValue);
      out.push({
        id: Number(item.id || 0) || 0,
        date: String(item.date),
        dayValue: dayValue || 1,
        dayType: item.dayType || ((dayValue || 1) === 1 ? "Full day" : "Half day"),
        note: item.note ? String(item.note) : "",
        cert: item.cert ? String(item.cert) : "",
        contact: item.contact ? String(item.contact) : "",
        child: item.child ? String(item.child) : "",
        reason: item.reason ? String(item.reason) : ""
      });
    }
    let max = out.reduce((m,x)=>Math.max(m, Number(x.id||0)), 0);
    for(const x of out){
      if(!x.id || x.id <= 0){
        max += 1;
        x.id = max;
      }
    }
    return out;
  }

  function addSingle(listKey, entry){
    const list = state[listKey];
    if(list.some(x => x.date === entry.date)){
      return { ok:false, msg:`Ten dzień (${entry.date}) już istnieje w tej zakładce.` };
    }
    list.push({ id: nextId(list), ...entry });
    return { ok:true };
  }

  function addRange(listKey, fromIso, toIso, entryBuilder){
    const dates = enumerateDatesInclusive(fromIso, toIso);
    if(dates.length === 0){
      return { ok:false, msg:"Niepoprawny zakres. Upewnij się, że 'od' <= 'do'." };
    }

    const list = state[listKey];
    const existing = new Set(list.map(x => x.date));
    const toAdd = dates.filter(d => !existing.has(d));

    if(toAdd.length === 0){
      return { ok:false, msg:"Wszystkie dni z tego zakresu już istnieją w tej zakładce." };
    }

    for(const d of toAdd){
      const entry = entryBuilder(d);
      list.push({ id: nextId(list), ...entry });
    }

    return { ok:true, added: toAdd.length, skipped: dates.length - toAdd.length };
  }

  /* HOLIDAYS */

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

  const hLimitEl = document.getElementById("h-limit");
  const hTakenEl = document.getElementById("h-taken");
  const hLeftEl = document.getElementById("h-left");

  hLimitEl.textContent = String(HOLIDAYS_LIMIT);

  hAdd.addEventListener("click", () => {
    const date = hDate.value;
    const dayValue = Number(hType.value);
    const note = (hNote.value || "").trim();

    if(!date){ alert("Wybierz datę."); return; }

    const taken = sumDays(state.holidays);
    if (HOLIDAYS_LIMIT - (taken + dayValue) < 0){
      alert("Przekraczasz limit Holidays (25 dni).");
      return;
    }

    const res = addSingle("holidays", {
      date,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      note
    });

    if(!res.ok){ alert(res.msg); return; }

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

    if(!fromIso || !toIso){ alert("Uzupełnij daty 'od' i 'do'."); return; }

    const dates = enumerateDatesInclusive(fromIso, toIso);
    if(dates.length === 0){ alert("Niepoprawny zakres (od <= do)."); return; }

    const existing = new Set(state.holidays.map(x => x.date));
    const toAddCount = dates.filter(d => !existing.has(d)).length;

    const taken = sumDays(state.holidays);
    const wouldAdd = toAddCount * dayValue;
    if(HOLIDAYS_LIMIT - (taken + wouldAdd) < 0){
      alert("Zakres przekroczy limit Holidays (25 dni).");
      return;
    }

    const res = addRange("holidays", fromIso, toIso, (d) => ({
      date: d,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      note
    }));

    if(!res.ok){ alert(res.msg); return; }

    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    hFrom.value = "";
    hTo.value = "";
    hRangeType.value = "1";
  });

  hClear.addEventListener("click", () => {
    if(!confirm("Na pewno wyczyścić wszystkie wpisy Holidays?")) return;
    state.holidays = [];
    saveState();
    renderAll();
  });

  function renderHolidays(){
    const taken = sumDays(state.holidays);
    const left = HOLIDAYS_LIMIT - taken;

    hTakenEl.textContent = String(taken % 1 === 0 ? taken.toFixed(0) : taken.toFixed(1));
    hLeftEl.textContent = String(left % 1 === 0 ? left.toFixed(0) : left.toFixed(1));
    hLeftEl.classList.toggle("bad", left <= 2);
    hLeftEl.classList.toggle("good", left > 2);

    const list = [...state.holidays].sort((a,b) => (a.date || "").localeCompare(b.date || ""));
    hList.innerHTML = "";

    if(list.length === 0){
      hList.innerHTML = `<div class="item"><div class="item-meta">Brak wpisów. Dodaj dzień lub zakres.</div></div>`;
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
          ${item.note ? `<div><strong>Notatka:</strong> ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="btn mini danger" data-action="delete" data-id="${item.id}">Usuń</button>
        </div>
      `;

      el.querySelector('[data-action="delete"]').addEventListener("click", () => {
        state.holidays = state.holidays.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });

      hList.appendChild(el);
    });
  }

  /* SICKNESS */
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
    if(!date){ alert("Wybierz datę."); return; }

    const res = addSingle("sickness", {
      date,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      cert: sCert.value,
      contact: (sContact.value || "").trim(),
      note: (sNote.value || "").trim()
    });

    if(!res.ok){ alert(res.msg); return; }

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

    if(!fromIso || !toIso){ alert("Uzupełnij daty 'od' i 'do'."); return; }

    const cert = sCert.value;
    const contact = (sContact.value || "").trim();
    const note = (sNote.value || "").trim();

    const res = addRange("sickness", fromIso, toIso, (d) => ({
      date: d,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      cert,
      contact,
      note
    }));

    if(!res.ok){ alert(res.msg); return; }

    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    sFrom.value = "";
    sTo.value = "";
    sRangeType.value = "1";
  });

  sClear.addEventListener("click", () => {
    if(!confirm("Na pewno wyczyścić wszystkie wpisy Sickness?")) return;
    state.sickness = [];
    saveState();
    renderAll();
  });

  function renderSickness(){
    const total = sumDays(state.sickness);
    const list = [...state.sickness].sort((a,b) => (a.date || "").localeCompare(b.date || ""));

    sCountEl.textContent = String(list.length);
    sTotalEl.textContent = String(total % 1 === 0 ? total.toFixed(0) : total.toFixed(1));
    sLastEl.textContent = list.length ? fmtDateWithWeekday(list[list.length - 1].date) : "—";

    sList.innerHTML = "";
    if(list.length === 0){
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
          <button class="btn mini danger" data-action="delete" data-id="${item.id}">Usuń</button>
        </div>
      `;

      el.querySelector('[data-action="delete"]').addEventListener("click", () => {
        state.sickness = state.sickness.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });

      sList.appendChild(el);
    });
  }

  /* CHILDCARE */
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
    if(!date){ alert("Wybierz datę."); return; }

    const res = addSingle("childcare", {
      date,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      child: (cChild.value || "").trim(),
      reason: cReason.value,
      note: (cNote.value || "").trim()
    });

    if(!res.ok){ alert(res.msg); return; }

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

    if(!fromIso || !toIso){ alert("Uzupełnij daty 'od' i 'do'."); return; }

    const child = (cChild.value || "").trim();
    const reason = cReason.value;
    const note = (cNote.value || "").trim();

    const res = addRange("childcare", fromIso, toIso, (d) => ({
      date: d,
      dayValue,
      dayType: dayValue === 1 ? "Full day" : "Half day",
      child,
      reason,
      note
    }));

    if(!res.ok){ alert(res.msg); return; }

    saveState();
    renderAll();
    alert(`Dodano: ${res.added} dni. Pominięto (duplikaty): ${res.skipped}.`);

    cFrom.value = "";
    cTo.value = "";
    cRangeType.value = "1";
  });

  cClear.addEventListener("click", () => {
    if(!confirm("Na pewno wyczyścić wszystkie wpisy Child care?")) return;
    state.childcare = [];
    saveState();
    renderAll();
  });

  function renderChildcare(){
    const total = sumDays(state.childcare);
    const list = [...state.childcare].sort((a,b) => (a.date || "").localeCompare(b.date || ""));

    cCountEl.textContent = String(list.length);
    cTotalEl.textContent = String(total % 1 === 0 ? total.toFixed(0) : total.toFixed(1));
    cLastEl.textContent = list.length ? fmtDateWithWeekday(list[list.length - 1].date) : "—";

    cList.innerHTML = "";
    if(list.length === 0){
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
          <button class="btn mini danger" data-action="delete" data-id="${item.id}">Usuń</button>
        </div>
      `;

      el.querySelector('[data-action="delete"]').addEventListener("click", () => {
        state.childcare = state.childcare.filter(x => x.id !== item.id);
        saveState();
        renderAll();
      });

      cList.appendChild(el);
    });
  }

  function renderAll(){
    renderHolidays();
    renderSickness();
    renderChildcare();
  }

  // Init render
  renderAll();

  // PWA Service Worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
})();
