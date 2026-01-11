# 📚 Project-Template README

*A docs-first, AI-first workspace for lightning-fast product builds*

---

## 0 — Philosophy

> **Write → Refine → Build.**  
> Every document in `/instructions` is a stepping stone that feeds the next.  
> By the time a line of code is written, every requirement, style rule, and UX nuance is already machine-readable—and therefore agent-executable.

---

## 1 — Doc Pipeline (and **why** the order matters)

1. **`project-description.md`**  
   - *Purpose*: capture the raw human vision—scope, vibe, constraints.  
   - *Builds on*: nothing (starting point).

2. **`prd.md`**  
   - *Purpose*: convert the vision into a full AI-ready spec (pages, APIs, KPIs).  
   - *Builds on*: `project-description.md`.

3. **`style.md`**  
   - *Purpose*: establish a professional design system—tokens, components, spacing, color, typography.  
   - *Builds on*: `prd.md`.

4. **`user-journey.md`**  
   - *Purpose*: describe end-to-end UX flow, personas, edge-cases, blindspots.  
   - *Builds on*: `prd.md` + `style.md`.

5. **`schema.md`**  
   - *Purpose*: define a scalable DB & service schema that mirrors PRD and journey.  
   - *Builds on*: `prd.md` + `user-journey.md`.

6. **`checklist.md`**  
   - *Purpose*: fuse **all** prior docs into actionable tasks, sectioned by view, API, component.  
   - *Builds on*: `prd.md` + `style.md` + `user-journey.md` + `schema.md`.

### Logic of the order

- You can't design pixels (style) before you know *what* you're building (PRD).  
- You can't craft holistic UX (journey) before the interface language exists (style).  
- You can't finalise tables & relations (schema) before every user flow is known.  
- You can't track progress (checklist) without a frozen definition of "done."

---

## 2 — Untouchables

See `untouchables.md` for the authoritative "do-not-edit" list (e.g., `/mcp/*`, `.env`, files marked `# @lock`).

---

## 3 — The MCP System

### Overview

**MCP (Model-Context Protocol)** provides your AI coding assistant with real-time browser logs during development. When building web apps, your AI can see live console logs, errors, and network failures from Chrome—making debugging exponentially faster.

### System Components

**Central MCP Server** (hosted separately)
- Receives logs from Chrome extensions across all your projects
- Routes logs to the appropriate project's local log router
- Manages authentication tokens and project registration

**Chrome Extension** (installed once, works everywhere)
- Captures console logs, errors, warnings, and network failures from any webpage
- Automatically sends logs to the central MCP server
- Available as a separate Chrome extension repository

**Project Log Router** (`mcp/mcp-logs/`)
- Receives logs from the central server and saves them locally
- Creates `mcp-logs.txt` (full history) and `mcp-temp-logs.txt` (current session)
- See `mcp/mcp-logs/README.md` for complete system details

### Quick Setup

1. **One-time**: Set up the central MCP server (separate repository)
2. **One-time**: Install the Chrome extension with your auth token
3. **Per project**: Run `npm run setup-project` to configure MCP logging

> **Result**: Your AI assistant gets live browser logs in `mcp/mcp-logs/logs/` with zero manual intervention.

---

## 4 — Folder Anatomy (quick reference)

```
root/
├── instructions/          ← All editable spec docs
│   ├── apis/             ← API cheat-sheets for the LLM
│   ├── ui/               ← Design snippets / tokens (optional)
│   └── wireframes/       ← PNG/SVG mock-ups (optional)
├── mcp/                  ← MCP integration
│   └── mcp-logs/         ← Project's log router & config
├── checkers/             ← CI-style code validators or agent guardrails
├── cursorrules.md
├── env.md
├── package.json
└── README.md
```

---

## 5 — Working Cycle for Humans & Agents

1. **Human** fills `project-description.md` with rich detail.  
2. **Agent** generates `prd.md`; human reviews/tweaks.  
3. **Agent** drafts `style.md`; designer polishes tokens.  
4. **Agent** writes `user-journey.md`; PM confirms flows.  
5. **Agent** outputs `schema.md`; backend lead signs off.  
6. **Agent** compiles `checklist.md`; becomes single source of truth.  
7. **Build phase**: each checklist item triggers code generation, with real-time log access from MCP
8. **Ship → Iterate → Profit 🚀**

---

## 6 — Quick-Start for New Projects

> **TL;DR** – create project with your script, then run **one** command for complete setup.

```bash
# 1. Create project from template (your external script)
createNewProject shopify-to-google

# 2. Complete setup (GitHub repo + deps + MCP logging)
npm run setup-project
```

### What This Workflow Does

1. **`createNewProject shopify-to-google`** (your script):
   - Copies template files to new project directory
   - Updates `settings/config.yaml` with project name
   - Opens project in Cursor

2. **`npm run setup-project`** (in new project):
   - Reads project name from `settings/config.yaml`
   - Creates GitHub repo with that name automatically
   - Sets up development environment and MCP logging

### What `npm run setup-project` Does

This single command runs six steps in sequence:

1. **`npm install`** - Installs project dependencies (npm-run-all, concurrently, etc.)
2. **`github:init`** - Reads project name from config, creates GitHub repo, and pushes to master branch
3. **`project:port`** - Picks a free port & writes it to settings/config.yaml
4. **`mcp:install`** - Installs MCP log router dependencies
5. **`mcp:register`** - Registers your project with the central MCP server
6. **`mcp:router`** - Starts your local log router on port 4001 for real-time browser logs

### GitHub Repository Creation

The integrated GitHub setup automatically:
- ✅ Reads project name from `settings/config.yaml` (set by `createNewProject`)
- ✅ Initializes Git with `master` branch
- ✅ Creates initial commit with project-specific message
- ✅ Creates public GitHub repo under your account (`tctx`)
- ✅ Pushes code and sets up remote
- ✅ Sets `master` as default branch

### Manual Override Options

If you need to override the automatic project name:

```bash
# Override with specific name
npm run github:init my-different-name && npm run project:port

# Or run individual steps
npm run github:init                  # Will use config.yaml name or prompt
npm run project:port                 # Pick an available dev port
npm run mcp:install                  # Install MCP dependencies
npm run mcp:register                 # Register with central server
npm run mcp:router                   # Start log router
```

### Prerequisites

- Your `createNewProject` script set up and working
- GitHub CLI installed and authenticated (`brew install gh` + `gh auth login`)
  - **Detailed setup guide**: See `reference/prerequisites/github-cli-setup.md` for complete walkthrough
- Central MCP server running (one-time setup)
- Chrome extension installed with auth token (one-time setup)

### Result

Your project is live on GitHub with your AI assistant getting real-time browser logs in `mcp/mcp-logs/logs/`.

---

### Final Note

Treat docs like **code**—review, diff, PR, and version them.  
When the narrative changes, regenerate downstream docs so the chain of truth stays unbroken.  

**With MCP enabled**, your AI assistant becomes incredibly powerful—it can see exactly what's happening in your browser in real-time, making debugging and development exponentially faster.

Happy building!
