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

# Folder type key used to register the project path with ComfyUI's /view endpoint.
# ComfyUI's /view route reads folder_names_and_paths[type] to resolve the file,
# so any string key works as long as it's registered before the request arrives.
PM_FOLDER_TYPE = "pm_output"
PM_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mkv", ".webm"}

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
# folder_paths registration
# ---------------------------------------------------------------------------

def sync_folder_paths(project: str | None) -> None:
    """
    Keep folder_paths in sync so ComfyUI's /view endpoint can serve project
    files directly without writing a temp copy.
    """
    if project:
        ai_pipeline = str(Path(project) / "AIPipeline")
        folder_paths.folder_names_and_paths[PM_FOLDER_TYPE] = (
            [ai_pipeline],
            PM_EXTENSIONS,
        )
    else:
        folder_paths.folder_names_and_paths.pop(PM_FOLDER_TYPE, None)


def _patch_get_directory_by_type() -> None:
    """
    ComfyUI's /view endpoint calls folder_paths.get_directory_by_type(type) to
    resolve the base directory for a SavedResult. That function only knows about
    "output", "temp", and "input" — it returns None for any other string, causing
    /view to return a 400. Patch it once to also handle our custom PM_FOLDER_TYPE.
    """
    original = folder_paths.get_directory_by_type

    def patched(type_name: str) -> str | None:
        if type_name == PM_FOLDER_TYPE:
            entry = folder_paths.folder_names_and_paths.get(PM_FOLDER_TYPE)
            if entry and entry[0]:
                return entry[0][0]  # first registered path for this type
            return None
        return original(type_name)

    folder_paths.get_directory_by_type = patched


# Register on import so files from a previously-saved project are served after restart.
sync_folder_paths(load_state().get("current_project"))
_patch_get_directory_by_type()


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
    sync_folder_paths(state.get("current_project"))
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
    sync_folder_paths(folder_path)
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
