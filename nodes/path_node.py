from comfy_api.latest import io

from .save_utils import resolve_base_dir

APPEND_TO_OPTIONS = ["active", "project"]


class ResolveProjectPath(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PM_ResolveProjectPath",
            display_name="Resolve Project Path",
            category="ProjectManager",
            description=(
                "Returns the absolute path that the Project Manager would save to, "
                "without creating any files or folders. Use this to feed paths into "
                "any other node that accepts a file path string."
            ),
            inputs=[
                io.String.Input(
                    "filename",
                    default="",
                    tooltip=(
                        "File name or sub-path. Backslashes are normalised to forward slashes. "
                        "Example: 'renders/hero/frame' → .../renders/hero/frame"
                    ),
                ),
                io.Combo.Input(
                    "append_to",
                    options=APPEND_TO_OPTIONS,
                    default="active",
                    tooltip=(
                        "active → active folder path + filename  |  "
                        "project → project/AIPipeline root + filename"
                    ),
                ),
            ],
            outputs=[
                io.String.Output(
                    "path",
                    display_name="Path",
                    tooltip="Absolute path composed from the current Project Manager state.",
                ),
            ],
        )

    @classmethod
    def execute(cls, filename: str, append_to: str) -> io.NodeOutput:
        base = resolve_base_dir(append_to).replace("\\", "/")
        filename = filename.replace("\\", "/").strip("/")
        path = base + "/" + filename if filename else base
        return io.NodeOutput(path)
