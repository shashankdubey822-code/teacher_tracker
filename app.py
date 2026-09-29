"""
MRU Teacher Timetable Tracker — Hugging Face Gradio Runner
Runs on Gradio SDK with ZeroGPU support and FastAPI routes
"""

import os
import sys

# ZeroGPU initialization requirement
try:
    import spaces
    @spaces.GPU
    def zero_gpu_init():
        return "ready"
except Exception:
    pass

import gradio as gr
from fastapi.staticfiles import StaticFiles

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(CURRENT_DIR, "backend")
FRONTEND_DIR = os.path.join(CURRENT_DIR, "frontend")
sys.path.insert(0, BACKEND_DIR)

from server import app as fastapi_app

# Full-screen styling
custom_css = """
body, .gradio-container {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100% !important;
    height: 100vh !important;
    overflow: hidden !important;
}
footer {
    display: none !important;
}
"""

with gr.Blocks(title="MRU Faculty Timetable Tracker", css=custom_css) as demo:
    gr.HTML("""
    <iframe src="/static/index.html" style="position:fixed; top:0; left:0; width:100vw; height:100vh; border:none; margin:0; padding:0; z-index:999999;"></iframe>
    """)

# Mount FastAPI routes and static assets onto Gradio's internal FastAPI app
demo.app.include_router(fastapi_app.router)
if os.path.exists(FRONTEND_DIR):
    demo.app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
