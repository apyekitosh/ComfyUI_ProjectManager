import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from aiohttp import web
from server import PromptServer
import folder_paths

STATE_FILE = Path(__file__).parent.parent / "project_state.json"

DEFAULT_STATE: dict = {
    "current_project": None,
    "current_asset": "",          # active folder used when project is ON
    "current_local_asset": "",    # active folder used when project is OFF / no project
    "recent_projects": [],
    "enabled": False,
}

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pm_tkinter")


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            return {**DEFAULT_STATE, **data}
        except Exception:
            pass
    return DEFAULT_STATE.copy()


def save_state(state: dict) -> None:
    STATE_FILE.write_text(
        json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def get_current_state() -> dict:
    """Public accessor for save-nodes and other modules."""
    return load_state()



# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@PromptServer.instance.routes.get("/projectmanager/state")
async def api_get_state(request: web.Request) -> web.Response:
    return web.json_response(load_state())


@PromptServer.instance.routes.post("/projectmanager/state")
async def api_update_state(request: web.Request) -> web.Response:
    data = await request.json()
    state = load_state()
    for k in DEFAULT_STATE:
        if k in data:
            state[k] = data[k]
    state["recent_projects"] = state["recent_projects"][:5]
    save_state(state)
    return web.json_response(state)


def _pick_folder_sync() -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    folder = filedialog.askdirectory(title="Select Project Folder")
    root.destroy()
    return folder or None


@PromptServer.instance.routes.post("/projectmanager/pick_folder")
async def api_pick_folder(request: web.Request) -> web.Response:
    try:
        loop = asyncio.get_running_loop()
        folder = await loop.run_in_executor(_executor, _pick_folder_sync)
        return web.json_response({"path": folder})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/projectmanager/setup_project")
async def api_setup_project(request: web.Request) -> web.Response:
    data = await request.json()
    folder_path: str | None = data.get("path")
    if not folder_path:
        return web.json_response({"error": "No path provided"}, status=400)

    ai_pipeline = Path(folder_path) / "AIPipeline"
    try:
        ai_pipeline.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return web.json_response(
            {"error": f"Could not create AIPipeline folder: {e}"}, status=500
        )

    state = load_state()
    recent: list[str] = [p for p in state.get("recent_projects", []) if p != folder_path]
    recent.insert(0, folder_path)

    state["current_project"] = folder_path
    state["recent_projects"] = recent[:5]
    state["enabled"] = True

    save_state(state)
    return web.json_response(state)


@PromptServer.instance.routes.get("/projectmanager/output_dir")
async def api_output_dir(request: web.Request) -> web.Response:
    return web.json_response({"path": folder_paths.get_output_directory()})


@PromptServer.instance.routes.post("/projectmanager/open_folder")
async def api_open_folder(request: web.Request) -> web.Response:
    data = await request.json()
    path: str | None = data.get("path")
    if not path:
        return web.json_response({"error": "No path provided"}, status=400)
    try:
        import os
        os.makedirs(path, exist_ok=True)
        os.startfile(path)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
