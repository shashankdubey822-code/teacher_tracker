"""
EduPage Timetable Data Client
Reverse-engineered for Manav Rachna University (mru.edupage.org)
"""

import json
import logging
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

EDUPAGE_RPC_URL = "https://mru.edupage.org/timetable/server/regulartt.js?__func=regularttGetData"
DEFAULT_TT_NUM = "18"

DAY_MASKS = [
    ("10000", 0, "Monday", "Mo"),
    ("01000", 1, "Tuesday", "Tu"),
    ("00100", 2, "Wednesday", "We"),
    ("00010", 3, "Thursday", "Th"),
    ("00001", 4, "Friday", "Fr"),
]

PERIOD_SLOTS = [
    {"period": 1, "name": "1", "time": "08:10 - 09:00", "is_lunch": False},
    {"period": 2, "name": "2", "time": "09:00 - 09:50", "is_lunch": False},
    {"period": 3, "name": "3", "time": "09:50 - 10:40", "is_lunch": False},
    {"period": 4, "name": "4", "time": "10:40 - 11:30", "is_lunch": False},
    {"period": 5, "name": "Lunch", "time": "11:30 - 12:20", "is_lunch": True},
    {"period": 6, "name": "6", "time": "12:20 - 13:10", "is_lunch": False},
    {"period": 7, "name": "7", "time": "13:10 - 14:00", "is_lunch": False},
    {"period": 8, "name": "8", "time": "14:00 - 14:50", "is_lunch": False},
    {"period": 9, "name": "9", "time": "14:50 - 15:40", "is_lunch": False},
    {"period": 10, "name": "10", "time": "15:40 - 16:30", "is_lunch": False},
]


class EduPageClient:
    def __init__(self, tt_num: str = DEFAULT_TT_NUM):
        self.tt_num = tt_num
        self.raw_tables: Dict[str, Dict[str, Any]] = {}
        self.teachers: Dict[str, Dict[str, Any]] = {}
        self.classes: Dict[str, Dict[str, Any]] = {}
        self.subjects: Dict[str, Dict[str, Any]] = {}
        self.classrooms: Dict[str, Dict[str, Any]] = {}
        self.lessons: Dict[str, Dict[str, Any]] = {}
        self.cards: List[Dict[str, Any]] = []
        self.periods: List[Dict[str, Any]] = []
        self.last_updated: Optional[datetime] = None
        self.is_loaded = False

    def fetch_data(self) -> bool:
        """Fetches and parses the relational timetable snapshot from EduPage RPC."""
        payload = json.dumps({"__args": [None, self.tt_num], "__gsh": "00000000"}).encode("utf-8")
        req = urllib.request.Request(
            EDUPAGE_RPC_URL,
            data=payload,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                r = data.get("r", {})
                accessor = r.get("dbiAccessorRes", {})
                tables_list = accessor.get("tables", [])
                self.raw_tables = {tbl["id"]: tbl for tbl in tables_list if "id" in tbl}
                self._index_tables()
                self.last_updated = datetime.now()
                self.is_loaded = True
                logger.info(f"Loaded {len(self.teachers)} teachers and {len(self.cards)} cards from EduPage.")
                return True
        except Exception as e:
            logger.error(f"Failed to fetch data from EduPage: {e}")
            return False

    def _index_tables(self):
        """Indexes raw rows into fast O(1) lookup dicts."""
        # Teachers
        self.teachers = {}
        for row in self.raw_tables.get("teachers", {}).get("data_rows", []):
            name = (row.get("name") or "").strip()
            if name:
                self.teachers[str(row["id"])] = {
                    "id": str(row["id"]),
                    "name": name,
                    "short": (row.get("short") or "").strip(),
                    "color": row.get("color") or "#E2E8F0",
                }

        # Classes
        self.classes = {}
        for row in self.raw_tables.get("classes", {}).get("data_rows", []):
            self.classes[str(row["id"])] = {
                "id": str(row["id"]),
                "name": (row.get("name") or "").strip(),
                "short": (row.get("short") or "").strip(),
                "color": row.get("color") or "#FFFF99",
            }

        # Subjects
        self.subjects = {}
        for row in self.raw_tables.get("subjects", {}).get("data_rows", []):
            self.subjects[str(row["id"])] = {
                "id": str(row["id"]),
                "name": (row.get("name") or "").strip(),
                "short": (row.get("short") or "").strip(),
            }

        # Classrooms
        self.classrooms = {}
        for row in self.raw_tables.get("classrooms", {}).get("data_rows", []):
            self.classrooms[str(row["id"])] = {
                "id": str(row["id"]),
                "name": (row.get("name") or "").strip(),
                "short": (row.get("short") or "").strip(),
            }

        # Lessons
        self.lessons = {}
        for row in self.raw_tables.get("lessons", {}).get("data_rows", []):
            self.lessons[str(row["id"])] = {
                "id": str(row["id"]),
                "subjectid": str(row.get("subjectid") or ""),
                "teacherids": [str(tid) for tid in row.get("teacherids", [])],
                "classids": [str(cid) for cid in row.get("classids", [])],
                "groupnames": row.get("groupnames", []),
            }

        # Cards
        self.cards = self.raw_tables.get("cards", {}).get("data_rows", [])

        # Periods
        self.periods = PERIOD_SLOTS

    def get_teachers_list(self) -> List[Dict[str, Any]]:
        """Returns all teachers sorted alphabetically with total sessions count."""
        if not self.is_loaded:
            self.fetch_data()

        # Count sessions per teacher
        counts: Dict[str, int] = {}
        for card in self.cards:
            lesson = self.lessons.get(str(card.get("lessonid")))
            if lesson:
                for tid in lesson.get("teacherids", []):
                    counts[tid] = counts.get(tid, 0) + 1

        result = []
        for tid, t in self.teachers.items():
            result.append({
                "id": tid,
                "name": t["name"],
                "short": t["short"],
                "color": t["color"],
                "total_sessions": counts.get(tid, 0),
                "edupage_url": f"https://mru.edupage.org/timetable/view.php?num={self.tt_num}&teacher={tid}"
            })

        result.sort(key=lambda x: x["name"].lower())
        return result

    def get_classes_list(self) -> List[Dict[str, Any]]:
        """Returns all classes sorted alphabetically."""
        if not self.is_loaded:
            self.fetch_data()

        result = [
            {"id": cid, "name": c["name"], "short": c["short"]}
            for cid, c in self.classes.items()
            if c["name"]
        ]
        result.sort(key=lambda x: x["name"].lower())
        return result

    def get_teacher_timetable(self, teacher_id: str) -> Optional[Dict[str, Any]]:
        """
        Builds the 5 Days x 10 Periods matrix for a given teacher.
        Matches the institutional timetable grid format.
        """
        if not self.is_loaded:
            self.fetch_data()

        teacher_id = str(teacher_id)
        teacher = self.teachers.get(teacher_id)
        if not teacher:
            return None

        # Build grid structure: days -> periods -> list of card items
        # Day indices 0..4 (Monday to Friday)
        # Period 1..10
        grid: Dict[int, Dict[int, List[Dict[str, Any]]]] = {
            day_idx: {p["period"]: [] for p in PERIOD_SLOTS}
            for _, day_idx, _, _ in DAY_MASKS
        }

        # Filter cards for this teacher
        for card in self.cards:
            lesson = self.lessons.get(str(card.get("lessonid")))
            if not lesson or teacher_id not in lesson.get("teacherids", []):
                continue

            # Parse period
            try:
                period_num = int(card.get("period", 0))
            except (ValueError, TypeError):
                continue

            if period_num < 1 or period_num > 10:
                continue

            # Parse day
            days_mask = card.get("days", "")
            target_day_idx = None
            for mask, d_idx, _, _ in DAY_MASKS:
                if mask in days_mask:
                    target_day_idx = d_idx
                    break

            if target_day_idx is None:
                continue

            # Resolve subject, class names, classroom names
            subject = self.subjects.get(lesson["subjectid"], {}).get("name", "N/A")
            class_names = [
                self.classes.get(cid, {}).get("name", cid)
                for cid in lesson.get("classids", [])
            ]
            classroom_names = [
                self.classrooms.get(str(rid), {}).get("name", str(rid))
                for rid in card.get("classroomids", [])
            ]
            group_names = [g for g in lesson.get("groupnames", []) if g]

            card_info = {
                "card_id": str(card.get("id")),
                "subject": subject,
                "classes": class_names,
                "class_label": ", ".join(class_names),
                "classrooms": classroom_names,
                "room_label": ", ".join(classroom_names),
                "groups": group_names,
                "group_label": ", ".join(group_names) if group_names else "",
            }

            grid[target_day_idx][period_num].append(card_info)

        # Assemble into serializable matrix
        days_matrix = []
        for mask, day_idx, day_name, day_short in DAY_MASKS:
            periods_list = []
            for p_slot in PERIOD_SLOTS:
                p_num = p_slot["period"]
                items = grid[day_idx][p_num]
                is_lunch = p_slot["is_lunch"]
                is_free = (len(items) == 0 and not is_lunch)

                periods_list.append({
                    "period": p_num,
                    "name": p_slot["name"],
                    "time": p_slot["time"],
                    "is_lunch": is_lunch,
                    "is_free": is_free,
                    "items": items,
                })

            days_matrix.append({
                "day_index": day_idx,
                "day_name": day_name,
                "day_short": day_short,
                "periods": periods_list,
            })

        return {
            "teacher": teacher,
            "tt_num": self.tt_num,
            "institution": "Manav Rachna University, Sector 43, Faridabad",
            "validity": "3/8/2026-31/12/2026",
            "edupage_url": f"https://mru.edupage.org/timetable/view.php?num={self.tt_num}&teacher={teacher_id}",
            "days": days_matrix,
            "period_headers": PERIOD_SLOTS,
        }

    def get_class_timetable(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Builds timetable for a specific class (e.g. CSE 5A) for reference."""
        if not self.is_loaded:
            self.fetch_data()

        class_id = str(class_id)
        class_obj = self.classes.get(class_id)
        if not class_obj:
            return None

        grid: Dict[int, Dict[int, List[Dict[str, Any]]]] = {
            day_idx: {p["period"]: [] for p in PERIOD_SLOTS}
            for _, day_idx, _, _ in DAY_MASKS
        }

        for card in self.cards:
            lesson = self.lessons.get(str(card.get("lessonid")))
            if not lesson or class_id not in lesson.get("classids", []):
                continue

            try:
                period_num = int(card.get("period", 0))
            except (ValueError, TypeError):
                continue

            if period_num < 1 or period_num > 10:
                continue

            days_mask = card.get("days", "")
            target_day_idx = None
            for mask, d_idx, _, _ in DAY_MASKS:
                if mask in days_mask:
                    target_day_idx = d_idx
                    break

            if target_day_idx is None:
                continue

            subject = self.subjects.get(lesson["subjectid"], {}).get("name", "N/A")
            teacher_names = [
                self.teachers.get(tid, {}).get("name", tid)
                for tid in lesson.get("teacherids", [])
            ]
            classroom_names = [
                self.classrooms.get(str(rid), {}).get("name", str(rid))
                for rid in card.get("classroomids", [])
            ]
            group_names = [g for g in lesson.get("groupnames", []) if g]

            card_info = {
                "card_id": str(card.get("id")),
                "subject": subject,
                "teachers": teacher_names,
                "teacher_label": ", ".join(teacher_names),
                "classrooms": classroom_names,
                "room_label": ", ".join(classroom_names),
                "groups": group_names,
                "group_label": ", ".join(group_names) if group_names else "",
            }

            grid[target_day_idx][period_num].append(card_info)

        days_matrix = []
        for mask, day_idx, day_name, day_short in DAY_MASKS:
            periods_list = []
            for p_slot in PERIOD_SLOTS:
                p_num = p_slot["period"]
                items = grid[day_idx][p_num]
                periods_list.append({
                    "period": p_num,
                    "name": p_slot["name"],
                    "time": p_slot["time"],
                    "is_lunch": p_slot["is_lunch"],
                    "is_free": (len(items) == 0 and not p_slot["is_lunch"]),
                    "items": items,
                })

            days_matrix.append({
                "day_index": day_idx,
                "day_name": day_name,
                "day_short": day_short,
                "periods": periods_list,
            })

        return {
            "class": class_obj,
            "tt_num": self.tt_num,
            "institution": "Manav Rachna University, Sector 43, Faridabad",
            "validity": "3/8/2026-31/12/2026",
            "days": days_matrix,
            "period_headers": PERIOD_SLOTS,
        }

    def get_free_teachers(self, day_index: int, period_num: int) -> List[Dict[str, Any]]:
        """Returns all teachers who do NOT have any class at the specified day & period."""
        if not self.is_loaded:
            self.fetch_data()

        # Target day mask
        target_mask = None
        for mask, d_idx, _, _ in DAY_MASKS:
            if d_idx == day_index:
                target_mask = mask
                break

        if not target_mask:
            return []

        busy_teacher_ids = set()
        for card in self.cards:
            if card.get("period") == str(period_num) and target_mask in card.get("days", ""):
                lesson = self.lessons.get(str(card.get("lessonid")))
                if lesson:
                    for tid in lesson.get("teacherids", []):
                        busy_teacher_ids.add(tid)

        free_teachers = [
            t for tid, t in self.teachers.items()
            if tid not in busy_teacher_ids
        ]
        free_teachers.sort(key=lambda x: x["name"].lower())
        return free_teachers
