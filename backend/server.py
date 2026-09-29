"""
Teacher Timetable & Availability Tracker — Backend Server
FastAPI server serving reverse-engineered EduPage data & static frontend
"""

import os
import sys
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from edupage_client import EduPageClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MRU Teacher Timetable Tracker",
    description="Reverse-engineered EduPage timetable and teacher tracker for Manav Rachna University",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize client
client = EduPageClient(tt_num="18")


@app.on_event("startup")
async def startup_event():
    logger.info("Initializing EduPage timetable data on startup...")
    success = client.fetch_data()
    if success:
        logger.info(f"Loaded successfully! Teachers: {len(client.teachers)}, Cards: {len(client.cards)}")
    else:
        logger.error("Failed to load initial timetable data from EduPage.")


@app.get("/api/status")
def get_status():
    """Returns the current data status, count of records, and last updated time."""
    return {
        "is_loaded": client.is_loaded,
        "teachers_count": len(client.teachers),
        "classes_count": len(client.classes),
        "cards_count": len(client.cards),
        "last_updated": client.last_updated.isoformat() if client.last_updated else None,
        "last_updated_formatted": client.last_updated.strftime("%I:%M:%S %p") if client.last_updated else "Never"
    }


@app.get("/api/teachers")
def get_teachers(q: Optional[str] = None):
    """Returns all teachers, optionally filtered by search query."""
    teachers = client.get_teachers_list()
    if q:
        query = q.strip().lower()
        teachers = [
            t for t in teachers
            if query in t["name"].lower() or query in t["short"].lower()
        ]
    return {
        "total": len(teachers),
        "last_updated": client.last_updated.isoformat() if client.last_updated else None,
        "last_updated_formatted": client.last_updated.strftime("%I:%M:%S %p") if client.last_updated else "Never",
        "teachers": teachers
    }


@app.get("/api/teacher/{teacher_id}/timetable")
def get_teacher_timetable(teacher_id: str):
    """Returns the weekly 5-day timetable grid for a specific teacher."""
    timetable = client.get_teacher_timetable(teacher_id)
    if not timetable:
        raise HTTPException(status_code=404, detail=f"Teacher with ID '{teacher_id}' not found")
    return timetable


@app.get("/api/classes")
def get_classes():
    """Returns all available classes."""
    classes = client.get_classes_list()
    return {
        "total": len(classes),
        "classes": classes
    }


@app.get("/api/class/{class_id}/timetable")
def get_class_timetable(class_id: str):
    """Returns the weekly 5-day timetable grid for a specific class (e.g. CSE 5A)."""
    timetable = client.get_class_timetable(class_id)
    if not timetable:
        raise HTTPException(status_code=404, detail=f"Class with ID '{class_id}' not found")
    return timetable


@app.get("/api/free-teachers")
def get_free_teachers(
    day: int = Query(..., ge=0, le=4, description="Day index 0=Mo, 1=Tu, 2=We, 3=Th, 4=Fr"),
    period: int = Query(..., ge=1, le=10, description="Period number 1 to 10")
):
    """Finds all teachers who are currently free / in cabin during a specific period."""
    free_list = client.get_free_teachers(day, period)
    return {
        "day_index": day,
        "period": period,
        "total_free": len(free_list),
        "teachers": free_list
    }


@app.post("/api/refresh")
def refresh_data():
    """Forces a refresh from EduPage servers."""
    success = client.fetch_data()
    return {
        "success": success,
        "teachers_count": len(client.teachers),
        "cards_count": len(client.cards),
        "last_updated": client.last_updated.isoformat() if client.last_updated else None,
        "last_updated_formatted": client.last_updated.strftime("%I:%M:%S %p") if client.last_updated else "Never"
    }


# Path to frontend directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def serve_frontend_index():
        index_file = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Teacher Tracker API is running. frontend/index.html not found."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
