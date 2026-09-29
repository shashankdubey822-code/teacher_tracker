"""
Hugging Face Spaces Entry Point
Runs FastAPI backend + static frontend on port 7860 with optional Gradio mounting
"""

import os
import sys
import uvicorn

# Add backend directory to Python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(CURRENT_DIR, "backend"))

from server import app as fastapi_app

try:
    import gradio as gr
    demo = gr.Blocks(title="MRU Faculty Timetable Tracker")
    with demo:
        gr.HTML('<iframe src="/" style="width:100%; height:98vh; border:none; margin:0; padding:0;"></iframe>')
    app = gr.mount_gradio_app(fastapi_app, demo, path="/gradio")
except Exception as e:
    app = fastapi_app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
