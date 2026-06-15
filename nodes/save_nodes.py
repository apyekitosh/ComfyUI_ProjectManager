import json

import numpy as np
from PIL import Image as PILImage
from PIL.PngImagePlugin import PngInfo

from comfy_api.latest import io, ui
from comfy_api.latest import Types

from .save_utils import SAVE_TO_OPTIONS, resolve_base_dir, build_save_paths, make_saved_result


class SaveImageToProject(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PM_SaveImageToProject",
            display_name="Save Image to Project",
            category="ProjectManager",
            description=(
                "Saves images to the active project folder using the ComfyUI "
                "naming convention (<name>_00001_.png). Falls back to the default "
                "ComfyUI output folder when no project is active or paused."
            ),
            is_output_node=True,
            inputs=[
                io.Image.Input("images"),
                io.String.Input(
                    "filename",
                    default="image",
                    tooltip=(
                        "File name or sub-path. Slashes create subfolders — e.g. "
                        "'renders/hero' saves to .../renders/hero_00001_.png"
                    ),
                ),
                io.Combo.Input(
                    "save_to",
                    options=SAVE_TO_OPTIONS,
                    default="active",
                    tooltip=(
                        "active → active folder (project/AIPipeline/<active folder> or output/<active folder>)  |  "
                        "project → project/AIPipeline root (or ComfyUI output)  |  "
                        "temp → ComfyUI temp dir (ephemeral preview)"
                    ),
                ),
                io.Boolean.Input(
                    "show_preview",
                    default=True,
                    label_on="Visible",
                    label_off="Hidden",
                    tooltip="Show a preview of the saved image on the node.",
                ),
            ],
            outputs=[
                io.String.Output(
                    "filepath",
                    display_name="Filepath",
                    is_output_list=True,
                    tooltip="Absolute path(s) to the saved file(s).",
                ),
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo],
        )

    @classmethod
    def execute(cls, images, filename, save_to, show_preview):
        base_dir = resolve_base_dir(save_to)
        paths = build_save_paths(filename, base_dir, "png", images.shape[0])

        saved_results: list[ui.SavedResult] = []
        for img_tensor, path in zip(images, paths):
            arr = np.clip(255.0 * img_tensor.cpu().numpy(), 0, 255).astype(np.uint8)
            pil_img = PILImage.fromarray(arr)

            meta = PngInfo()
            if cls.hidden.prompt is not None:
                meta.add_text("prompt", json.dumps(cls.hidden.prompt))
            if cls.hidden.extra_pnginfo is not None:
                for k, v in cls.hidden.extra_pnginfo.items():
                    meta.add_text(k, json.dumps(v))

            pil_img.save(path, pnginfo=meta, compress_level=4)
            if show_preview:
                saved_results.append(make_saved_result(path, save_to))

        if show_preview:
            return io.NodeOutput(paths, ui=ui.SavedImages(saved_results))

        return io.NodeOutput(paths)


class SaveVideoToProject(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PM_SaveVideoToProject",
            display_name="Save Video to Project",
            category="ProjectManager",
            description=(
                "Saves video to the active project folder as mp4. Falls back to "
                "the default ComfyUI output folder when no project is active or paused."
            ),
            is_output_node=True,
            inputs=[
                io.Video.Input("video"),
                io.String.Input(
                    "filename",
                    default="video",
                    tooltip=(
                        "File name or sub-path. Slashes create subfolders — e.g. "
                        "'renders/hero' saves to .../renders/hero_00001_.mp4"
                    ),
                ),
                io.Combo.Input(
                    "save_to",
                    options=SAVE_TO_OPTIONS,
                    default="active",
                    tooltip=(
                        "active → active folder (project/AIPipeline/<active folder> or output/<active folder>)  |  "
                        "project → project/AIPipeline root (or ComfyUI output)  |  "
                        "temp → ComfyUI temp dir (ephemeral preview)"
                    ),
                ),
                io.Boolean.Input(
                    "show_preview",
                    default=True,
                    label_on="Visible",
                    label_off="Hidden",
                    tooltip="Show a preview of the saved video on the node.",
                ),
            ],
            outputs=[
                io.String.Output(
                    "filepath",
                    display_name="Filepath",
                    tooltip="Absolute path to the saved mp4 file.",
                ),
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo],
        )

    @classmethod
    def execute(cls, video, filename, save_to, show_preview):
        base_dir = resolve_base_dir(save_to)
        [save_path] = build_save_paths(filename, base_dir, "mp4", 1)

        meta = None
        meta_dict: dict = {}
        if cls.hidden.prompt is not None:
            meta_dict["prompt"] = cls.hidden.prompt
        if cls.hidden.extra_pnginfo is not None:
            meta_dict.update(cls.hidden.extra_pnginfo)
        if meta_dict:
            meta = meta_dict

        video.save_to(
            save_path,
            format=Types.VideoContainer("mp4"),
            codec="auto",
            metadata=meta,
        )

        if not show_preview:
            return io.NodeOutput(save_path)

        saved_result = make_saved_result(save_path, save_to)
        return io.NodeOutput(save_path, ui=ui.PreviewVideo([saved_result]))
