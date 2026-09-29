---
title: Teacher Tracker
emoji: 👨‍🏫
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# MRU Faculty Timetable & Availability Tracker

A high-performance web tool built by reverse-engineering the **EduPage / aSc Timetables** portal of **Manav Rachna University** (`mru.edupage.org`).

---

## 🌟 Highlights & Features

1. **Teacher Schedule Selection**:
   - Live searchable autocomplete for all **273 Faculty Members**.
   - A–Z alphabetical quick index.
   - Total weekly teaching hours summary (e.g. `23 hrs / wk`).

2. **Official Timetable Layout**:
   - Matches the institutional aSc print format exactly:
     - Header: University crest + *Great Place To Work* badge.
     - Title: Teacher Name (or Class/Batch).
     - Days: `Mo`, `Tu`, `We`, `Th`, `Fr`.
     - 10 Periods: `08:10` through `16:30` with `Lunch` (11:30 - 12:20) clearly separated.
     - Cells: Room / Lab code (top-left), Group split (top-right), Subject name (center), Class/Batch name (bottom).
     - Empty slots: Clean whitespace / Available status.

3. **Faculty Availability Finder ("Who is Free Now?")**:
   - Automatically detects current day and time slot.
   - Lists all teachers who do not have an active lecture or lab.
   - Great for finding teachers in their cabins for doubt clearing or lab evaluations.

4. **Class Timetable Mode**:
   - Can also view class-wise schedules (e.g. `CSE 5A`, `AIML 5B`).

5. **A4 Landscape Print & PDF Export**:
   - Built-in `@media print` CSS so pressing `Ctrl+P` or clicking **Print / PDF** produces the exact landscape institutional sheet.

6. **Direct EduPage Deep-Link**:
   - Direct button to open the teacher's schedule on official EduPage: `https://mru.edupage.org/timetable/view.php?num=18&teacher=-<id>`.

---

## 🚀 How to Run

### Method 1: One-Click Run (Windows)
Double-click **`run.bat`**. It will automatically:
1. Verify dependencies.
2. Launch the backend server at `http://localhost:8000`.
3. Open your browser to the web app.

### Method 2: Manual Terminal Run
```bash
# Navigate to this folder
cd "C:\Users\hp\OneDrive - Manav Rachna Education Institutions\Desktop\teacher_tracker"

# Install requirements
pip install -r backend/requirements.txt

# Start backend
python backend/server.py
```
Open `http://localhost:8000` in any web browser.

---

## 🔬 Reverse-Engineering Architecture

* **EduPage RPC Endpoint**: `POST https://mru.edupage.org/timetable/server/regulartt.js?__func=regularttGetData`
* **Active Revision**: `tt_num = "18"` (`MRU-JULY-DECEMBER 2026`)
* **URL Parameter Mapping**:
  * Classes: `https://mru.edupage.org/timetable/view.php?num=18&class=-<id>` (`Trieda`)
  * Teachers: `https://mru.edupage.org/timetable/view.php?num=18&teacher=-<id>` (`Ucitel`)
  * Classrooms: `https://mru.edupage.org/timetable/view.php?num=18&classroom=-<id>` (`Ucebna`)
