import os
import re

import folder_paths
from comfy_api.latest import io, ui

from .server import PM_FOLDER_TYPE, get_current_state

SAVE_TO_OPTIONS = ["asset", "project", "temp"]


class _FolderTypeProxy:
    """
    Wraps a custom folder-type string so ui.SavedResult accepts it.
    SavedResult calls type.value internally, expecting an enum — this duck-types that.
    """
    def __init__(self, name: str):
        self.value = name

_PM_FOLDER_TYPE_PROXY = _FolderTypeProxy(PM_FOLDER_TYPE)


def resolve_base_dir(save_to: str) -> str:
    """
    Return the base output directory for the given save_to mode.

    When the project is ON:
      - "asset"   → project/AIPipeline/<current_asset>   (or AIPipeline root if blank)
      - "project" → project/AIPipeline
      - "temp"    → ComfyUI temp

    When the project is OFF / no project set:
      - "asset"   → ComfyUI output/<current_local_asset>  (or output root if blank)
      - "project" → ComfyUI output  (straight to output root, ignores local active folder)
      - "temp"    → ComfyUI temp
    """
    if save_to == "temp":
        return folder_paths.get_temp_directory()

    state = get_current_state()
    project: str | None = state.get("current_project")
    enabled: bool = state.get("enabled", False)

    if not project or not enabled:
        output_dir = folder_paths.get_output_directory()
        if save_to == "asset":
            local = state.get("current_local_asset", "").strip().strip("/\\")
            return os.path.join(output_dir, local) if local else output_dir
        return output_dir  # "project" mode with no active project → output root

    base = os.path.join(project, "AIPipeline")
    if save_to == "asset":
        asset = state.get("current_asset", "").strip().strip("/\\")
        return os.path.join(base, asset) if asset else base
    return base  # "project" mode → AIPipeline root


def _find_next_counter(directory: str, basename: str, ext: str) -> int:
    pattern = re.compile(rf"^{re.escape(basename)}_(\d+)_\.{re.escape(ext)}$")
    try:
        counters = [
            int(m.group(1))
            for f in os.listdir(directory)
            if (m := pattern.match(f))
        ]
        return max(counters) + 1 if counters else 1
    except OSError:
        return 1


def build_save_paths(filename: str, base_dir: str, ext: str, count: int = 1) -> list[str]:
    """
    Resolve subfolders from filename, create directories, and return a list of
    absolute file paths following the ComfyUI naming convention:
    <basename>_{counter:05d}_.<ext>
    """
    filename = filename.replace("\\", "/").strip("/")

    if "/" in filename:
        subdir, basename = filename.rsplit("/", 1)
    else:
        subdir, basename = "", filename

    if not basename:
        basename = "output"

    full_dir = os.path.join(base_dir, subdir) if subdir else base_dir
    os.makedirs(full_dir, exist_ok=True)

    start = _find_next_counter(full_dir, basename, ext)
    return [
        os.path.join(full_dir, f"{basename}_{start + i:05d}_.{ext}")
        for i in range(count)
    ]


def make_saved_result(save_path: str, save_to: str) -> ui.SavedResult:
    """
    Build a SavedResult pointing at the actual saved file so ComfyUI's /view
    endpoint can serve it directly — no temp copy needed.

    For project saves the custom 'pm_output' type is used (registered in
    folder_paths by server.py). For fallback / temp uses standard FolderType.
    """
    state = get_current_state()
    project: str | None = state.get("current_project")
    enabled: bool = state.get("enabled", False)

    if save_to == "temp":
        base = folder_paths.get_temp_directory()
        folder_type = io.FolderType.temp
    elif project and enabled:
        base = os.path.join(project, "AIPipeline")
        folder_type = _PM_FOLDER_TYPE_PROXY  # proxy so SavedResult's type.value call works
    else:
        base = folder_paths.get_output_directory()
        folder_type = io.FolderType.output

    rel = os.path.relpath(os.path.dirname(save_path), base)
    subfolder = "" if rel == "." else rel.replace("\\", "/")
    return ui.SavedResult(os.path.basename(save_path), subfolder, folder_type)
