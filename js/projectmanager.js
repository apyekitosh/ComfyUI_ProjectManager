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
        current_local_asset: "",
        recent_projects: [],
        enabled: false,
    },
    outputDir: "",
    dropdown: null,
    dropdownOpen: false,
    setProjectBtn: null,
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

function isProjectActive() {
    return !!(pm.state.current_project && pm.state.enabled);
}

function getSavePath() {
    if (isProjectActive()) {
        const asset = (pm.state.current_asset ?? "").trim().replace(/\\/g, "/").replace(/^\/|\/$/g, "");
        const base = (pm.state.current_project ?? "").replace(/\\/g, "/") + "/AIPipeline";
        return asset ? base + "/" + asset : base;
    }
    const local = (pm.state.current_local_asset ?? "").trim().replace(/\\/g, "/").replace(/^\/|\/$/g, "");
    const base = (pm.outputDir || "").replace(/\\/g, "/");
    return local && base ? base + "/" + local : (base || local || "ComfyUI output");
}

function getSaveInfo() {
    return "Saving to: " + getSavePath();
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
        .pm-save-info {
            font-size: 11px;
            font-style: italic;
            color: #555;
            line-height: 1.4;
            word-break: break-all;
        }
        #pm-toggle-circle {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
            transition: background 0.2s;
        }
        #pm-toggle-circle.pm-circle-clickable { cursor: pointer; }
        #pm-toggle-circle.pm-circle-clickable:hover { opacity: 0.8; }
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
    const projectOn = isProjectActive();
    const name = projectName(state.current_project);

    // Determine toggle circle color
    let circleColor, circleClickable, circleTitle;
    if (!state.current_project) {
        circleColor = "#555";
        circleClickable = false;
        circleTitle = "No active project";
    } else if (state.enabled) {
        circleColor = "#4caf50";
        circleClickable = true;
        circleTitle = "Project ON — click to pause";
    } else {
        circleColor = "#e05555";
        circleClickable = true;
        circleTitle = "Project paused — click to enable";
    }

    const activeFolder = projectOn
        ? (state.current_asset ?? "")
        : (state.current_local_asset ?? "");

    pm.dropdown.innerHTML = `
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:10px;
                    border-bottom:1px solid #2e2e2e;"
             title="${esc(state.current_project ?? "")}">
            <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                <i class="pi pi-folder" style="color:#f0a500;flex-shrink:0;"></i>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>
            </div>
            <div id="pm-toggle-circle"
                 class="${circleClickable ? "pm-circle-clickable" : ""}"
                 title="${esc(circleTitle)}"
                 style="background:${circleColor};">
            </div>
        </div>

        ${projectOn ? `
            <!-- Project ON: recents + select folder -->
            <div class="pm-label">Recent Projects</div>
            <div id="pm-recent" style="margin-bottom:10px;">
                ${
                    state.recent_projects.length
                        ? state.recent_projects
                            .map((p) => `
                                <div class="pm-item pm-recent-item" data-path="${esc(p)}" title="${esc(p)}">
                                    <i class="pi pi-history" style="font-size:11px;color:#777;flex-shrink:0;"></i>
                                    <span>${esc(projectName(p))}</span>
                                </div>`)
                            .join("")
                        : `<div style="color:#555;padding:4px 8px;font-size:12px;">No recent projects</div>`
                }
            </div>

            <button class="pm-btn" id="pm-pick-folder" style="margin-bottom:0;">
                <i class="pi pi-folder-open" style="color:#f0a500;"></i>
                <span>Select Folder…</span>
            </button>

            <hr class="pm-divider" />
        ` : `
            <!-- Project OFF / no project: just Select Folder button -->
            <button class="pm-btn" id="pm-pick-folder" style="margin-bottom:12px;">
                <i class="pi pi-folder-open" style="color:#f0a500;"></i>
                <span>Select Folder…</span>
            </button>
        `}

        <!-- Active Folder (both modes) -->
        <div class="pm-label">Active Folder</div>
        <input
            id="pm-active-folder"
            class="pm-input"
            type="text"
            placeholder="e.g. characters/hero/concept"
            value="${esc(activeFolder)}"
            style="margin-bottom:12px;"
        />

        <hr class="pm-divider" style="margin-top:0;" />

        <!-- Save info + exit -->
        <button id="pm-open-folder" class="pm-save-info"
                style="background:none;border:none;padding:0;margin:0;text-align:left;
                       cursor:pointer;margin-bottom:${projectOn ? "12px" : "0"};">
            ${esc(getSaveInfo())}
        </button>

        ${projectOn ? `
            <button class="pm-btn pm-btn-danger" id="pm-exit" style="margin-top:12px;">
                <i class="pi pi-times-circle"></i>
                <span>Exit Project</span>
            </button>
        ` : ""}
    `;

    // --- bind events ---

    // Toggle circle
    if (circleClickable) {
        pm.dropdown.querySelector("#pm-toggle-circle").addEventListener("click", toggleEnabled);
    }

    // Recent project items (only rendered in project-ON layout)
    pm.dropdown.querySelectorAll(".pm-recent-item").forEach((el) => {
        el.addEventListener("click", () => selectRecent(el.dataset.path));
    });

    pm.dropdown.querySelector("#pm-pick-folder").addEventListener("click", pickAndSetup);

    // Active Folder input
    const folderInput = pm.dropdown.querySelector("#pm-active-folder");
    folderInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") folderInput.blur();
    });
    folderInput.addEventListener("blur", () => {
        const val = folderInput.value.trim();
        if (projectOn) {
            pushState({ current_asset: val });
        } else {
            pushState({ current_local_asset: val });
        }
    });

    // Open save folder in Explorer
    pm.dropdown.querySelector("#pm-open-folder").addEventListener("click", () => {
        const path = getSavePath();
        api.fetchApi(`${API}/open_folder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        }).catch((e) => toast("error", "Project Manager", String(e)));
    });

    // Exit Project (only in project-ON layout)
    pm.dropdown.querySelector("#pm-exit")?.addEventListener("click", exitProject);
}

// ---------------------
// UI sync
// ---------------------

function syncUI() {
    if (pm.dropdownOpen) renderDropdown();
}

// ---------------------
// Button discovery
// ---------------------

function findAndDecorateButtons() {
    if (!pm.setProjectBtn) {
        const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Project Manager"
        );
        if (btn) {
            pm.setProjectBtn = btn;
            btn.addEventListener("mouseenter", () => {
                btn.title = pm.state.current_project
                    ? projectName(pm.state.current_project)
                    : "No project set";
            });
        }
    }

    if (!pm.setProjectBtn) {
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
        setTimeout(findAndDecorateButtons, 400);
    },

    actionBarButtons: [
        {
            icon: "pi pi-folder-open",
            label: "Project Manager",
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
    ],
});
