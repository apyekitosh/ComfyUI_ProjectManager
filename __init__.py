from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nodes import get_all_nodes

WEB_DIRECTORY = "./js"


class ProjectManagerExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return get_all_nodes()


async def comfy_entrypoint() -> ProjectManagerExtension:
    return ProjectManagerExtension()
