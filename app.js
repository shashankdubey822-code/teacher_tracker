/**
 * MRU Teacher Timetable & Availability Tracker
 * Dual-Mode: Connects to local FastAPI backend OR operates autonomously via static database
 */

const API_BASE = ""; // Relative path to FastAPI backend

// Global State
let currentMode = "teacher"; // 'teacher' or 'class'
let teachersList = [];
let classesList = [];
let currentTimetable = null;
let currentSelectionId = null;
let selectedAlpha = null;
let lastUpdatedTimestamp = null;
let lastUpdatedFormatted = "Live Sync";
let isStaticMode = false;
let staticDatabase = null;

// Period Timings Configuration
const PERIOD_DEFINITIONS = [
  { period: 1, name: "1.", time: "8:10 - 9:00", is_lunch: false },
  { period: 2, name: "2.", time: "9:00 - 9:50", is_lunch: false },
  { period: 3, name: "3.", time: "9:50 - 10:40", is_lunch: false },
  { period: 4, name: "4.", time: "10:40 - 11:30", is_lunch: false },
  { period: 5, name: "Lunch", time: "11:30 - 12:20", is_lunch: true },
  { period: 6, name: "6.", time: "12:20 - 13:10", is_lunch: false },
  { period: 7, name: "7.", time: "13:10 - 14:00", is_lunch: false },
  { period: 8, name: "8.", time: "14:00 - 14:50", is_lunch: false },
  { period: 9, name: "9.", time: "14:50 - 15:40", is_lunch: false },
  { period: 10, name: "10.", time: "15:40 - 16:30", is_lunch: false },
];

const DAY_MASKS = [
  { mask: "10000", dayIndex: 0, dayName: "Monday", dayShort: "Mo" },
  { mask: "01000", dayIndex: 1, dayName: "Tuesday", dayShort: "Tu" },
  { mask: "00100", dayIndex: 2, dayName: "Wednesday", dayShort: "We" },
  { mask: "00010", dayIndex: 3, dayName: "Thursday", dayShort: "Th" },
  { mask: "00001", dayIndex: 4, dayName: "Friday", dayShort: "Fr" },
];

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  renderAlphabetFilter();
  await loadInitialData();

  // Click outside to close dropdown (ignore clicks inside search or alpha buttons)
  document.addEventListener("click", (e) => {
    const wrapper = document.querySelector(".search-wrapper");
    const isAlphaBtn = e.target.closest(".alpha-filter") || e.target.classList.contains("alpha-btn");
    if (wrapper && !wrapper.contains(e.target) && !isAlphaBtn) {
      closeDropdown();
    }
  });

  // Pre-load default or URL-specified teacher
  const params = new URLSearchParams(window.location.search);
  const teacherIdParam = params.get("teacher");
  const classIdParam = params.get("class");

  if (teacherIdParam) {
    loadTimetable(teacherIdParam, "teacher");
  } else if (classIdParam) {
    switchMode("class");
    loadTimetable(classIdParam, "class");
  } else {
    // Show top suggestions
    showPopularSuggestions();
  }

  // Periodic status check
  setInterval(updateRelativeSyncTime, 30000);
}

// ----------------- Data Loading (Dual API / Static Mode) -----------------

async function loadInitialData() {
  try {
    const res = await fetch(`${API_BASE}/api/teachers`);
    if (!res.ok) throw new Error("API not responding, fallback to static");
    const data = await res.json();
    teachersList = data.teachers || [];
    document.getElementById("teacherCountBadge").textContent = teachersList.length;

    const classRes = await fetch(`${API_BASE}/api/classes`);
    const classData = await classRes.json();
    classesList = classData.classes || [];
    document.getElementById("classCountBadge").textContent = classesList.length;

    await fetchStatus();
  } catch (err) {
    console.warn("Backend API not reachable. Switching to autonomous Static Database mode.");
    await loadStaticDatabase();
  }
}

async function loadStaticDatabase() {
  try {
    const res = await fetch("timetable_data.json");
    if (!res.ok) throw new Error("timetable_data.json not found");
    staticDatabase = await res.json();
    isStaticMode = true;
    teachersList = staticDatabase.teachers || [];
    classesList = staticDatabase.classes || [];
    lastUpdatedFormatted = staticDatabase.last_updated || "Live Sync";
    lastUpdatedTimestamp = new Date();
    document.getElementById("teacherCountBadge").textContent = teachersList.length;
    document.getElementById("classCountBadge").textContent = classesList.length;
    updateSyncBadge();
  } catch (e) {
    console.error("Failed to load static database:", e);
  }
}

async function fetchStatus() {
  if (isStaticMode) {
    updateSyncBadge();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (res.ok) {
      const data = await res.json();
      lastUpdatedTimestamp = data.last_updated ? new Date(data.last_updated) : new Date();
      lastUpdatedFormatted = data.last_updated_formatted || "Just now";
      updateSyncBadge();
    }
  } catch (err) {
    console.error("Failed to check status:", err);
  }
}

function updateSyncBadge() {
  const badgeText = document.getElementById("syncStatusText");
  if (!badgeText) return;

  if (!lastUpdatedTimestamp) {
    badgeText.textContent = lastUpdatedFormatted;
    return;
  }

  const now = new Date();
  const diffSec = Math.floor((now - lastUpdatedTimestamp) / 1000);

  if (diffSec < 45) {
    badgeText.textContent = "Just now";
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    badgeText.textContent = `${mins}m ago (${lastUpdatedFormatted})`;
  } else {
    badgeText.textContent = lastUpdatedFormatted;
  }
}

function updateRelativeSyncTime() {
  updateSyncBadge();
}

async function handleManualRefresh() {
  const btn = document.getElementById("btnRefresh");
  const icon = document.getElementById("syncIcon");
  const text = document.getElementById("syncText");

  btn.disabled = true;
  icon.classList.add("spinning");
  text.textContent = "Syncing...";

  if (isStaticMode) {
    setTimeout(async () => {
      await loadStaticDatabase();
      if (currentSelectionId) {
        await loadTimetable(currentSelectionId, currentMode, false);
      }
      btn.disabled = false;
      icon.classList.remove("spinning");
      text.textContent = "Sync Now";
      showToast(`✅ Synced! ${teachersList.length} Teachers verified.`);
    }, 600);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/refresh`, { method: "POST" });
    const data = await res.json();

    if (data.success) {
      lastUpdatedTimestamp = new Date();
      lastUpdatedFormatted = data.last_updated_formatted || new Date().toLocaleTimeString();
      updateSyncBadge();

      await loadInitialData();
      if (currentSelectionId) {
        await loadTimetable(currentSelectionId, currentMode, false);
      }
      showToast(`✅ Synced! ${data.teachers_count} Teachers & ${data.cards_count} Cards verified.`);
    } else {
      showToast("⚠️ Sync completed with warnings from EduPage.", "warn");
    }
  } catch (err) {
    console.error("Manual sync failed:", err);
    showToast("❌ Failed to reach EduPage server.", "error");
  } finally {
    btn.disabled = false;
    icon.classList.remove("spinning");
    text.textContent = "Sync Now";
  }
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toastNotification");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");

  toastMsg.textContent = message;
  toastIcon.textContent = type === "error" ? "❌" : (type === "warn" ? "⚠️" : "✅");

  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 4000);
}

// ----------------- Helper: Smart Alphabet & Title Matching -----------------

function cleanNameForAlpha(name) {
  if (!name) return "";
  return name.trim().replace(/^(dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "");
}

function matchesLetter(name, letter) {
  if (!letter) return true;
  if (!name) return false;
  const upperLetter = letter.toUpperCase();
  const trimmed = name.trim().toUpperCase();
  const stripped = cleanNameForAlpha(name).toUpperCase();

  if (trimmed.startsWith(upperLetter) || stripped.startsWith(upperLetter)) {
    return true;
  }
  const words = stripped.split(/\s+/);
  return words.some(w => w.startsWith(upperLetter));
}

// ----------------- Alphabet Filter -----------------

function renderAlphabetFilter() {
  const container = document.getElementById("alphaFilterContainer");
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  
  let html = `<button class="alpha-btn ${selectedAlpha === null ? 'active' : ''}" onclick="filterByAlpha(event, null)">All</button>`;
  letters.forEach(letter => {
    html += `<button class="alpha-btn ${selectedAlpha === letter ? 'active' : ''}" onclick="filterByAlpha(event, '${letter}')">${letter}</button>`;
  });
  container.innerHTML = html;
}

function filterByAlpha(event, letter) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  selectedAlpha = letter;
  renderAlphabetFilter();
  
  const searchInput = document.getElementById("searchInput");
  searchInput.value = letter || "";
  
  const list = currentMode === "teacher" ? teachersList : classesList;
  const filtered = letter 
    ? list.filter(item => matchesLetter(item.name, letter))
    : list;
  
  renderDropdownResults(filtered, letter);
  openDropdown();

  const emptyState = document.getElementById("emptyState");
  if (!emptyState.classList.contains("hidden")) {
    const suggestionsBox = document.getElementById("popularSuggestions");
    if (suggestionsBox) {
      if (filtered.length === 0) {
        suggestionsBox.innerHTML = `<p style="color:#94a3b8; width:100%; text-align:center;">No ${currentMode}s found for letter "${letter}"</p>`;
      } else {
        suggestionsBox.innerHTML = filtered.slice(0, 16).map(item => `
          <div class="suggestion-chip" onclick="selectItem('${item.id}')">
            ${currentMode === 'teacher' ? '👨‍🏫' : '🎓'} ${escapeHtml(item.name)} ${item.short ? `(${escapeHtml(item.short)})` : ''}
          </div>
        `).join("");
      }
    }
  }
}

// ----------------- Search & Autocomplete -----------------

function handleSearchInput(e) {
  const query = e.target.value.trim().toLowerCase();
  selectedAlpha = null;
  renderAlphabetFilter();

  if (!query) {
    closeDropdown();
    return;
  }

  const list = currentMode === "teacher" ? teachersList : classesList;
  const filtered = list.filter(item => {
    const nameMatch = item.name.toLowerCase().includes(query);
    const shortMatch = item.short && item.short.toLowerCase().includes(query);
    return nameMatch || shortMatch;
  });

  renderDropdownResults(filtered);
  openDropdown();
}

function renderDropdownResults(items, currentLetter = null) {
  const dropdown = document.getElementById("searchDropdown");
  if (!items || items.length === 0) {
    dropdown.innerHTML = `<div class="dropdown-item" style="color:#94a3b8; cursor:default;">No matches found</div>`;
    return;
  }

  const headerHtml = currentLetter ? `
    <div style="padding: 8px 16px; background: #EEF2F6; font-size: 11.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
      Showing ${items.length} ${currentMode}s under letter "${currentLetter}"
    </div>
  ` : "";

  const itemsHtml = items.slice(0, 50).map(item => `
    <div class="dropdown-item" onclick="selectItem('${item.id}')">
      <span class="item-main">${escapeHtml(item.name)}</span>
      <span class="item-badge">${escapeHtml(item.short || (item.total_sessions ? item.total_sessions + ' hrs' : ''))}</span>
    </div>
  `).join("");

  dropdown.innerHTML = headerHtml + itemsHtml;
}

function openDropdown() {
  document.getElementById("searchDropdown").classList.remove("hidden");
}

function closeDropdown() {
  document.getElementById("searchDropdown").classList.add("hidden");
}

function selectItem(id) {
  closeDropdown();
  loadTimetable(id, currentMode);
}

// ----------------- Mode Switching -----------------

function switchMode(mode) {
  currentMode = mode;
  document.getElementById("btnModeTeacher").classList.toggle("active", mode === "teacher");
  document.getElementById("btnModeClass").classList.toggle("active", mode === "class");

  const searchInput = document.getElementById("searchInput");
  searchInput.value = "";
  searchInput.placeholder = mode === "teacher" 
    ? "Search by teacher name or department (e.g. Roshi, XEBIA, Dipali, SOE)..." 
    : "Search by class / branch (e.g. CSE 5A, AIML 5B, ME 3A)...";

  selectedAlpha = null;
  renderAlphabetFilter();
  showPopularSuggestions();
}

function showPopularSuggestions() {
  const suggestionsBox = document.getElementById("popularSuggestions");
  if (!suggestionsBox) return;

  if (currentMode === "teacher") {
    const topTeachers = [...teachersList]
      .sort((a, b) => (b.total_sessions || 0) - (a.total_sessions || 0))
      .slice(0, 8);

    suggestionsBox.innerHTML = topTeachers.map(t => `
      <div class="suggestion-chip" onclick="selectItem('${t.id}')">
        👨‍🏫 ${escapeHtml(t.name)} (${t.short || t.total_sessions + 'h'})
      </div>
    `).join("");
  } else {
    const topClasses = classesList.slice(0, 8);
    suggestionsBox.innerHTML = topClasses.map(c => `
      <div class="suggestion-chip" onclick="selectItem('${c.id}')">
        🎓 ${escapeHtml(c.name)}
      </div>
    `).join("");
  }
}

// ----------------- Load & Render Timetable -----------------

async function loadTimetable(id, mode, showSpinner = true) {
  currentSelectionId = id;
  const loading = document.getElementById("loadingIndicator");
  const empty = document.getElementById("emptyState");
  const grid = document.getElementById("gridContainer");

  if (showSpinner) {
    loading.classList.remove("hidden");
    empty.classList.add("hidden");
    grid.classList.add("hidden");
  }

  // 1. Static Mode Generation
  if (isStaticMode && staticDatabase) {
    const data = (mode === "teacher") 
      ? generateTeacherTimetableLocally(id) 
      : generateClassTimetableLocally(id);
    
    if (!data) {
      alert("Could not load timetable for this selection.");
      loading.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    currentTimetable = data;
    renderOfficialTimetable(data, mode);
    loading.classList.add("hidden");
    grid.classList.remove("hidden");
    return;
  }

  // 2. FastAPI Backend Mode
  try {
    const endpoint = mode === "teacher" 
      ? `${API_BASE}/api/teacher/${encodeURIComponent(id)}/timetable`
      : `${API_BASE}/api/class/${encodeURIComponent(id)}/timetable`;

    const res = await fetch(endpoint);
    if (!res.ok) throw new Error("Timetable not found");

    const data = await res.json();
    currentTimetable = data;
    renderOfficialTimetable(data, mode);

    loading.classList.add("hidden");
    grid.classList.remove("hidden");
  } catch (err) {
    console.error("Error loading timetable:", err);
    loading.classList.add("hidden");
    empty.classList.remove("hidden");
    alert("Could not load timetable for this selection.");
  }
}

// ----------------- Client-Side Timetable Generators (for Static Mode) -----------------

function generateTeacherTimetableLocally(teacherId) {
  const teacher = (staticDatabase.teachers || []).find(t => String(t.id) === String(teacherId));
  if (!teacher) return null;

  const lessons = staticDatabase.lessons || {};
  const classesMap = {};
  (staticDatabase.classes || []).forEach(c => { classesMap[String(c.id)] = c; });
  const classrooms = staticDatabase.classrooms || {};
  const subjects = staticDatabase.subjects || {};
  const cards = staticDatabase.cards || [];

  const grid = {};
  DAY_MASKS.forEach(d => {
    grid[d.dayIndex] = {};
    PERIOD_DEFINITIONS.forEach(p => {
      grid[d.dayIndex][p.period] = [];
    });
  });

  cards.forEach(card => {
    const lesson = lessons[String(card.lessonid)];
    if (!lesson || !lesson.teacherids || !lesson.teacherids.includes(String(teacherId))) return;

    const pNum = parseInt(card.period);
    if (isNaN(pNum) || pNum < 1 || pNum > 10) return;

    let targetDay = null;
    DAY_MASKS.forEach(d => {
      if ((card.days || "").includes(d.mask)) targetDay = d.dayIndex;
    });
    if (targetDay === null) return;

    const subj = (subjects[lesson.subjectid] || {}).name || "N/A";
    const classNames = (lesson.classids || []).map(cid => (classesMap[cid] || {}).name || cid);
    const roomNames = (card.classroomids || []).map(rid => (classrooms[rid] || {}).name || rid);
    const groups = (lesson.groupnames || []).filter(Boolean);

    grid[targetDay][pNum].push({
      card_id: String(card.id),
      subject: subj,
      classes: classNames,
      class_label: classNames.join(", "),
      classrooms: roomNames,
      room_label: roomNames.join(", "),
      groups: groups,
      group_label: groups.join(", ")
    });
  });

  const daysMatrix = DAY_MASKS.map(d => ({
    day_index: d.dayIndex,
    day_name: d.dayName,
    day_short: d.dayShort,
    periods: PERIOD_DEFINITIONS.map(p => ({
      period: p.period,
      name: p.name,
      time: p.time,
      is_lunch: p.is_lunch,
      is_free: (grid[d.dayIndex][p.period].length === 0 && !p.is_lunch),
      items: grid[d.dayIndex][p.period]
    }))
  }));

  return {
    teacher: teacher,
    tt_num: staticDatabase.tt_num || "18",
    institution: staticDatabase.institution || "Manav Rachna University, Sector 43, Faridabad",
    validity: staticDatabase.validity || "3/8/2026-31/12/2026",
    edupage_url: `https://mru.edupage.org/timetable/view.php?num=18&teacher=${teacher.id}`,
    days: daysMatrix,
    period_headers: PERIOD_DEFINITIONS
  };
}

function generateClassTimetableLocally(classId) {
  const classesList = staticDatabase.classes || [];
  const classObj = classesList.find(c => String(c.id) === String(classId));
  if (!classObj) return null;

  const lessons = staticDatabase.lessons || {};
  const teachersMap = {};
  (staticDatabase.teachers || []).forEach(t => { teachersMap[String(t.id)] = t; });
  const classrooms = staticDatabase.classrooms || {};
  const subjects = staticDatabase.subjects || {};
  const cards = staticDatabase.cards || [];

  const grid = {};
  DAY_MASKS.forEach(d => {
    grid[d.dayIndex] = {};
    PERIOD_DEFINITIONS.forEach(p => {
      grid[d.dayIndex][p.period] = [];
    });
  });

  cards.forEach(card => {
    const lesson = lessons[String(card.lessonid)];
    if (!lesson || !lesson.classids || !lesson.classids.includes(String(classId))) return;

    const pNum = parseInt(card.period);
    if (isNaN(pNum) || pNum < 1 || pNum > 10) return;

    let targetDay = null;
    DAY_MASKS.forEach(d => {
      if ((card.days || "").includes(d.mask)) targetDay = d.dayIndex;
    });
    if (targetDay === null) return;

    const subj = (subjects[lesson.subjectid] || {}).name || "N/A";
    const teacherNames = (lesson.teacherids || []).map(tid => (teachersMap[tid] || {}).name || tid);
    const roomNames = (card.classroomids || []).map(rid => (classrooms[rid] || {}).name || rid);
    const groups = (lesson.groupnames || []).filter(Boolean);

    grid[targetDay][pNum].push({
      card_id: String(card.id),
      subject: subj,
      teachers: teacherNames,
      teacher_label: teacherNames.join(", "),
      classrooms: roomNames,
      room_label: roomNames.join(", "),
      groups: groups,
      group_label: groups.join(", ")
    });
  });

  const daysMatrix = DAY_MASKS.map(d => ({
    day_index: d.dayIndex,
    day_name: d.dayName,
    day_short: d.dayShort,
    periods: PERIOD_DEFINITIONS.map(p => ({
      period: p.period,
      name: p.name,
      time: p.time,
      is_lunch: p.is_lunch,
      is_free: (grid[d.dayIndex][p.period].length === 0 && !p.is_lunch),
      items: grid[d.dayIndex][p.period]
    }))
  }));

  return {
    class: classObj,
    tt_num: staticDatabase.tt_num || "18",
    institution: staticDatabase.institution || "Manav Rachna University, Sector 43, Faridabad",
    validity: staticDatabase.validity || "3/8/2026-31/12/2026",
    days: daysMatrix,
    period_headers: PERIOD_DEFINITIONS
  };
}

function getFreeTeachersLocally(dayIndex, periodNum) {
  const targetMask = (DAY_MASKS.find(d => d.dayIndex === Number(dayIndex)) || {}).mask;
  if (!targetMask) return [];

  const busyTeacherIds = new Set();
  (staticDatabase.cards || []).forEach(card => {
    if (String(card.period) === String(periodNum) && (card.days || "").includes(targetMask)) {
      const lesson = (staticDatabase.lessons || {})[String(card.lessonid)];
      if (lesson && lesson.teacherids) {
        lesson.teacherids.forEach(tid => busyTeacherIds.add(String(tid)));
      }
    }
  });

  return (staticDatabase.teachers || [])
    .filter(t => !busyTeacherIds.has(String(t.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ----------------- Render Official Timetable -----------------

function renderOfficialTimetable(data, mode) {
  const titleElem = document.getElementById("sheetMainTitle");
  const metaElem = document.getElementById("teacherMetaBadge");
  const weeklyLoadElem = document.getElementById("weeklyLoadText");
  const validityElem = document.getElementById("validityText");
  const edupageLink = document.getElementById("btnEduPageLink");

  let totalSessions = 0;

  if (mode === "teacher") {
    const t = data.teacher;
    titleElem.textContent = t.name;
    metaElem.textContent = t.short ? `Dept / Code: ${t.short}` : "";
    edupageLink.href = data.edupage_url || `https://mru.edupage.org/timetable/view.php?num=18&teacher=${t.id}`;
    
    data.days.forEach(d => {
      d.periods.forEach(p => {
        totalSessions += (p.items || []).length;
      });
    });
    weeklyLoadElem.textContent = `${totalSessions} hrs / wk`;
  } else {
    const c = data.class;
    titleElem.textContent = c.name;
    metaElem.textContent = `Section / Batch: ${c.short || c.name}`;
    edupageLink.href = `https://mru.edupage.org/timetable/view.php?num=18&class=${c.id}`;
    
    data.days.forEach(d => {
      d.periods.forEach(p => {
        totalSessions += (p.items || []).length;
      });
    });
    weeklyLoadElem.textContent = `${totalSessions} hrs / wk`;
  }

  if (data.validity) {
    validityElem.textContent = data.validity;
  }

  const headerRow = document.getElementById("periodsHeaderRow");
  let headerHtml = `<th class="day-col-header">Day</th>`;
  
  PERIOD_DEFINITIONS.forEach(p => {
    const isLunch = p.is_lunch;
    headerHtml += `
      <th class="period-header-cell ${isLunch ? 'lunch-col' : ''}">
        <span class="period-num">${p.name}</span>
        <span class="period-time">${p.time}</span>
      </th>
    `;
  });
  headerRow.innerHTML = headerHtml;

  const tbody = document.getElementById("timetableBody");
  let bodyHtml = "";

  data.days.forEach(day => {
    bodyHtml += `<tr>`;
    bodyHtml += `<td class="day-cell">${day.day_short}</td>`;

    day.periods.forEach(slot => {
      const isLunch = slot.is_lunch;
      const isFree = slot.is_free;
      const items = slot.items || [];

      let cellClass = "slot-cell";
      if (isLunch) cellClass += " is-lunch";
      if (isFree) cellClass += " is-free";

      bodyHtml += `<td class="${cellClass}">`;

      if (isLunch) {
        bodyHtml += `</td>`;
      } else if (items.length > 0) {
        bodyHtml += `<div class="slot-content-wrapper">`;
        items.forEach(item => {
          bodyHtml += `
            <div class="card-item">
              <div class="card-top-row">
                <span class="card-room">${escapeHtml(item.room_label || "")}</span>
                <span class="card-group">${escapeHtml(item.group_label || "")}</span>
              </div>
              <div class="card-subject">${escapeHtml(item.subject || "")}</div>
              <div class="card-bottom-row ${mode === 'class' ? 'teacher-name-label' : ''}">
                ${escapeHtml(mode === 'teacher' ? (item.class_label || "") : (item.teacher_label || ""))}
              </div>
            </div>
          `;
        });
        bodyHtml += `</div>`;
      } else {
        bodyHtml += `<div class="free-indicator">Free</div>`;
      }

      bodyHtml += `</td>`;
    });

    bodyHtml += `</tr>`;
  });

  tbody.innerHTML = bodyHtml;
}

// ----------------- Free Teacher Modal -----------------

function openFreeModal() {
  document.getElementById("freeModal").classList.remove("hidden");
  setLiveCurrentTime();
}

function closeFreeModal(e) {
  document.getElementById("freeModal").classList.add("hidden");
}

function setLiveCurrentTime() {
  const now = new Date();
  const day = now.getDay();
  const dayIndex = (day >= 1 && day <= 5) ? day - 1 : 0;
  document.getElementById("freeDaySelect").value = dayIndex;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMins = hours * 60 + minutes;

  let periodVal = 1;
  if (totalMins >= 490 && totalMins < 540) periodVal = 1;
  else if (totalMins >= 540 && totalMins < 590) periodVal = 2;
  else if (totalMins >= 590 && totalMins < 640) periodVal = 3;
  else if (totalMins >= 640 && totalMins < 690) periodVal = 4;
  else if (totalMins >= 740 && totalMins < 790) periodVal = 6;
  else if (totalMins >= 790 && totalMins < 840) periodVal = 7;
  else if (totalMins >= 840 && totalMins < 890) periodVal = 8;
  else if (totalMins >= 890 && totalMins < 940) periodVal = 9;
  else if (totalMins >= 940) periodVal = 10;

  document.getElementById("freePeriodSelect").value = periodVal;
  fetchFreeTeachers();
}

async function fetchFreeTeachers() {
  const day = document.getElementById("freeDaySelect").value;
  const period = document.getElementById("freePeriodSelect").value;
  const grid = document.getElementById("freeTeachersGrid");
  const countText = document.getElementById("freeCountText");

  grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#94a3b8;">Searching free teachers...</p>`;

  if (isStaticMode && staticDatabase) {
    const teachers = getFreeTeachersLocally(day, period);
    countText.textContent = teachers.length;
    renderFreeTeachersGrid(teachers);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/free-teachers?day=${day}&period=${period}`);
    const data = await res.json();
    const teachers = data.teachers || [];
    countText.textContent = teachers.length;
    renderFreeTeachersGrid(teachers);
  } catch (err) {
    console.error("Failed to fetch free teachers:", err);
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#ef4444;">Error fetching free teachers.</p>`;
  }
}

function renderFreeTeachersGrid(teachers) {
  const grid = document.getElementById("freeTeachersGrid");
  if (!teachers || teachers.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#94a3b8;">No free teachers found for this period.</p>`;
    return;
  }

  grid.innerHTML = teachers.map(t => `
    <div class="free-teacher-card" onclick="selectFreeTeacher('${t.id}')">
      <div class="free-teacher-name">👨‍🏫 ${escapeHtml(t.name)}</div>
      <div class="free-teacher-code">${escapeHtml(t.short || 'Faculty')}</div>
    </div>
  `).join("");
}

function selectFreeTeacher(id) {
  closeFreeModal();
  switchMode("teacher");
  loadTimetable(id, "teacher");
}

// ----------------- Utilities -----------------

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
