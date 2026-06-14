import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const API = "/projectmanager";

// ---------------------
// Shared state
// ---------------------

const pm = {
    state: {
        current_project: null,
        current_asset: "",
        recent_projects: [],
        enabled: false,
    },
    outputDir: "",
    dropdown: null,
    dropdownOpen: false,
    setProjectBtn: null,
    toggleBtn: null,
};

// ---------------------
// API helpers
// ---------------------

async function fetchState() {
    try {
        const r = await api.fetchApi(`${API}/state`);
        pm.state = await r.json();
    } catch (e) {
        console.error("[ProjectManager] fetchState:", e);
    }
}

async function fetchOutputDir() {
    try {
        const r = await api.fetchApi(`${API}/output_dir`);
        const { path } = await r.json();
        pm.outputDir = path ?? "";
    } catch (_) {}
}

async function pushState(patch) {
    try {
        const r = await api.fetchApi(`${API}/state`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        pm.state = await r.json();
        syncUI();
    } catch (e) {
        toast("error", "Project Manager", String(e));
    }
}

async function apiSetupProject(folderPath) {
    const r = await api.fetchApi(`${API}/setup_project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folderPath }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    pm.state = data;
}

// ---------------------
// Actions
// ---------------------

async function pickAndSetup() {
    closeDropdown();
    let path, error;
    try {
        const r = await api.fetchApi(`${API}/pick_folder`, { method: "POST" });
        ({ path, error } = await r.json());
    } catch (e) {
        toast("error", "Project Manager", String(e));
        return;
    }
    if (error) { toast("error", "Project Manager", error); return; }
    if (!path) return;

    try {
        await apiSetupProject(path);
        syncUI();
        toast("success", "Project set", projectName(pm.state.current_project));
    } catch (e) {
        toast("error", "Project Manager", String(e));
    }
}

async function selectRecent(folderPath) {
    closeDropdown();
    try {
        await apiSetupProject(folderPath);
        syncUI();
        toast("success", "Project set", projectName(pm.state.current_project));
    } catch (e) {
        toast("error", "Project Manager", String(e));
    }
}

async function exitProject() {
    await pushState({ current_project: null, enabled: false, current_asset: "" });
    closeDropdown();
    toast("info", "Project Manager", "Project exited — saving to default output");
}

async function toggleEnabled() {
    if (!pm.state.current_project) return;
    await pushState({ enabled: !pm.state.enabled });
}

// ---------------------
// Utilities
// ---------------------

function projectName(path) {
    if (!path) return "No project";
    return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function toast(severity, summary, detail) {
    app.extensionManager?.toast?.add({ severity, summary, detail, life: 3500 });
}

function esc(str) {
    return (str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

// ---------------------
// Styles (injected once)
// ---------------------

function injectStyles() {
    if (document.getElementById("pm-styles")) return;
    const s = document.createElement("style");
    s.id = "pm-styles";
    s.textContent = `
        #pm-dropdown * { box-sizing: border-box; }
        .pm-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            margin-bottom: 5px;
        }
        .pm-item {
            padding: 5px 8px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 7px;
            overflow: hidden;
        }
        .pm-item span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .pm-item:hover { background: #2a2a2a; }
        .pm-btn {
            width: 100%;
            padding: 7px 10px;
            background: #252525;
            border: 1px solid #3a3a3a;
            color: #ccc;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-family: inherit;
        }
        .pm-btn:hover:not(:disabled) { background: #2e2e2e; border-color: #4a4a4a; }
        .pm-btn-danger {
            background: #1f1212 !important;
            border-color: #4a1a1a !important;
            color: #c06060 !important;
        }
        .pm-btn-danger:hover:not(:disabled) {
            background: #2a1515 !important;
            border-color: #6a2020 !important;
        }
        .pm-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
        .pm-input {
            width: 100%;
            padding: 7px 9px;
            background: #141414;
            border: 1px solid #3a3a3a;
            color: #ccc;
            border-radius: 6px;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.15s;
        }
        .pm-input:focus { border-color: #555; }
        .pm-divider { border: none; border-top: 1px solid #2e2e2e; margin: 12px 0; }
    `;
    document.head.appendChild(s);
}

// ---------------------
// Dropdown
// ---------------------

function initDropdown() {
    if (pm.dropdown) return;
    pm.dropdown = document.createElement("div");
    pm.dropdown.id = "pm-dropdown";
    Object.assign(pm.dropdown.style, {
        position: "fixed",
        background: "#1e1e1e",
        border: "1px solid #3a3a3a",
        borderRadius: "8px",
        padding: "14px",
        width: "300px",
        zIndex: "10000",
        boxShadow: "0 8px 32px rgba(0,0,0,0.65)",
        fontSize: "13px",
        color: "#ccc",
        display: "none",
        fontFamily: "var(--p-font-family, sans-serif)",
        userSelect: "none",
    });
    document.body.appendChild(pm.dropdown);

    // Close on outside click
    document.addEventListener("mousedown", (e) => {
        if (
            pm.dropdownOpen &&
            !pm.dropdown.contains(e.target) &&
            e.target !== pm.setProjectBtn &&
            !pm.setProjectBtn?.contains(e.target)
        ) {
            closeDropdown();
        }
    });
}

function openDropdown(anchor) {
    initDropdown();
    injectStyles();
    renderDropdown();

    const rect = anchor.getBoundingClientRect();
    pm.dropdown.style.display = "block";
    pm.dropdown.style.top = `${rect.bottom + 6}px`;
    const left = Math.min(rect.left, window.innerWidth - 308);
    pm.dropdown.style.left = `${Math.max(4, left)}px`;
    pm.dropdownOpen = true;
}

function closeDropdown() {
    if (pm.dropdown) pm.dropdown.style.display = "none";
    pm.dropdownOpen = false;
}

function renderDropdown() {
    const { state } = pm;
    const noProject = !state.current_project;
    const name = projectName(state.current_project);

    pm.dropdown.innerHTML = `
        <div style="font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:10px;
                    border-bottom:1px solid #2e2e2e;overflow:hidden;text-overflow:ellipsis;
                    white-space:nowrap;display:flex;align-items:center;gap:8px;"
             title="${esc(state.current_project ?? "")}">
            <i class="pi pi-folder" style="color:#f0a500;flex-shrink:0;"></i>
            <span>${esc(name)}</span>
        </div>

        <div class="pm-label">Recent Projects</div>
        <div id="pm-recent" style="margin-bottom:10px;">
            ${
                state.recent_projects.length
                    ? state.recent_projects
                        .map(
                            (p) => `
                            <div class="pm-item pm-recent-item" data-path="${esc(p)}" title="${esc(p)}">
                                <i class="pi pi-history" style="font-size:11px;color:#777;flex-shrink:0;"></i>
                                <span>${esc(projectName(p))}</span>
                            </div>`
                        )
                        .join("")
                    : `<div style="color:#555;padding:4px 8px;font-size:12px;">No recent projects</div>`
            }
        </div>

        <button class="pm-btn" id="pm-pick-folder">
            <i class="pi pi-folder-open" style="color:#f0a500;"></i>
            <span>Select Folder…</span>
        </button>

        <hr class="pm-divider" />

        <div class="pm-label">Current Asset Path</div>
        <input
            id="pm-asset"
            class="pm-input"
            type="text"
            placeholder="e.g. characters/hero/concept"
            value="${esc(state.current_asset ?? "")}"
            style="margin-bottom:12px;"
        />

        <hr class="pm-divider" style="margin-top:0;" />

        <button class="pm-btn pm-btn-danger" id="pm-exit" ${noProject ? "disabled" : ""}>
            <i class="pi pi-times-circle"></i>
            <span>Exit Project</span>
        </button>
    `;

    // --- bind events ---

    pm.dropdown.querySelectorAll(".pm-recent-item").forEach((el) => {
        el.addEventListener("click", () => selectRecent(el.dataset.path));
    });

    pm.dropdown.querySelector("#pm-pick-folder").addEventListener("click", pickAndSetup);

    const assetInput = pm.dropdown.querySelector("#pm-asset");
    // stop ComfyUI from swallowing keys while typing
    assetInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") assetInput.blur();
    });
    assetInput.addEventListener("blur", () => {
        pushState({ current_asset: assetInput.value.trim() });
    });

    if (!noProject) {
        pm.dropdown.querySelector("#pm-exit").addEventListener("click", exitProject);
    }
}

// ---------------------
// UI sync
// ---------------------

function syncUI() {
    syncToggleIcon();
    if (pm.dropdownOpen) renderDropdown();
}

function syncToggleIcon() {
    if (!pm.toggleBtn) return;
    const icon = pm.toggleBtn.querySelector("i, .pi");
    if (!icon) return;
    const hasProject = !!pm.state.current_project;
    if (!hasProject) {
        icon.style.color = "#555";
    } else {
        icon.style.color = pm.state.enabled ? "#4caf50" : "#e05555";
    }
}

function getSetProjectTooltip() {
    return pm.state.current_project
        ? projectName(pm.state.current_project)
        : "No project set";
}

function getToggleTooltip() {
    if (!pm.state.current_project) return "No active project";
    if (pm.state.enabled) return `Saving to: ${pm.state.current_project}`;
    return `Saving to: ${pm.outputDir || "ComfyUI default output"} (project paused)`;
}

// ---------------------
// Button discovery
// ---------------------

function findAndDecorateButtons() {
    // Find Set Project button by its label text
    if (!pm.setProjectBtn) {
        const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Set Project"
        );
        if (btn) {
            pm.setProjectBtn = btn;
            btn.addEventListener("mouseenter", () => {
                btn.title = getSetProjectTooltip();
            });
        }
    }

    // Find toggle button: first button-like sibling after Set Project
    if (pm.setProjectBtn && !pm.toggleBtn) {
        const parent = pm.setProjectBtn.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(pm.setProjectBtn);
            for (let i = idx + 1; i < siblings.length; i++) {
                const el = siblings[i];
                const candidate =
                    el.tagName === "BUTTON"
                        ? el
                        : el.querySelector("button");
                if (candidate && candidate !== pm.setProjectBtn) {
                    pm.toggleBtn = candidate;
                    candidate.addEventListener("mouseenter", () => {
                        candidate.title = getToggleTooltip();
                    });
                    break;
                }
            }
        }
    }

    syncToggleIcon();

    // Retry until both buttons are found
    if (!pm.setProjectBtn || !pm.toggleBtn) {
        setTimeout(findAndDecorateButtons, 600);
    }
}

// ---------------------
// Extension registration
// ---------------------

app.registerExtension({
    name: "projectmanager.ui",

    async setup() {
        await Promise.all([fetchState(), fetchOutputDir()]);
        // Defer button discovery until Vue renders the action bar
        setTimeout(findAndDecorateButtons, 400);
    },

    actionBarButtons: [
        {
            icon: "pi pi-folder-open",
            label: "Set Project",
            onClick(event) {
                const anchor =
                    event?.currentTarget ??
                    event?.target ??
                    pm.setProjectBtn ??
                    document.body;
                if (pm.dropdownOpen) {
                    closeDropdown();
                } else {
                    openDropdown(anchor);
                }
            },
        },
        {
            icon: "pi pi-circle-fill",
            onClick() {
                toggleEnabled();
            },
        },
    ],
});
