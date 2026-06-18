import os
import re
import shutil

import folder_paths
from comfy_api.latest import io, ui

from .server import get_current_state

SAVE_TO_OPTIONS = ["active", "project", "temp"]


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
        if save_to == "active":
            local = state.get("current_local_asset", "").strip().strip("/\\")
            return os.path.join(output_dir, local) if local else output_dir
        return output_dir  # "project" mode with no active project → output root

    base = os.path.join(project, "AIPipeline")
    if save_to == "active":
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
    state = get_current_state()
    project: str | None = state.get("current_project")
    enabled: bool = state.get("enabled", False)

    if save_to == "temp":
        base = folder_paths.get_temp_directory()
        rel = os.path.relpath(os.path.dirname(save_path), base)
        subfolder = "" if rel == "." else rel.replace("\\", "/")
        return ui.SavedResult(os.path.basename(save_path), subfolder, io.FolderType.temp)

    if project and enabled:
        # The real file lives in the project dir. Write a temp copy so ComfyUI's
        # history sidebar and /view?type=temp can find it. Temp auto-cleans on
        # restart; the original stays in the project folder.
        temp_dir = folder_paths.get_temp_directory()
        temp_path = os.path.join(temp_dir, os.path.basename(save_path))
        shutil.copy2(save_path, temp_path)
        return ui.SavedResult(os.path.basename(save_path), "", io.FolderType.temp)

    # No active project — file is in ComfyUI output dir
    base = folder_paths.get_output_directory()
    rel = os.path.relpath(os.path.dirname(save_path), base)
    subfolder = "" if rel == "." else rel.replace("\\", "/")
    return ui.SavedResult(os.path.basename(save_path), subfolder, io.FolderType.output)
