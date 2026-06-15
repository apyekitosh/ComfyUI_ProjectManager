from comfy_api.latest import io
from . import server  # noqa: F401 — registers API routes on import
from .save_nodes import SaveImageToProject, SaveVideoToProject


def get_all_nodes() -> list[type[io.ComfyNode]]:
    return [SaveImageToProject, SaveVideoToProject]
