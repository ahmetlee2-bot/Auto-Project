# AUTONOW

AUTONOW is a deal intelligence product for low-budget vehicle flipping.

This workspace currently contains:

- `autonow.html`: Phase 0 static prototype
- `AUTONOW_RND_ROADMAP.md`: product and R&D roadmap
- `frontend/`: Next.js app shell for Phase 1
- `backend/`: FastAPI service shell with the first deal engine
- `scripts/`: PowerShell runtime and test helpers
- `docker-compose.yml`: container-based dev runtime

## Product direction

The product is intentionally scoped around a narrow operator workflow:

1. ingest a listing URL or raw text
2. normalize the vehicle data
3. estimate repair cost, offer level, exit target, and expected profit
4. move promising deals into a watchlist and portfolio workflow

The goal is not to start with aggressive multi-site scraping.
The goal is to first build a reliable operator cockpit.

The current API also returns a confidence score and manual verification notes so the operator can see where the model is weak before committing money.
It now also returns negotiation points, a recommended opening message, and a next action so each analysis can turn into an operator task.
The latest sprint adds source-aware parsing and a Hamburg-focused buy-box score so each listing can be evaluated against the operator profile instead of generic text rules alone.
The current build also persists operator settings and saved search profiles so the deal engine can be tuned to your real workflow and future source ingestion.

## Tech direction

- Frontend: Next.js + TypeScript
- Backend: FastAPI + Pydantic
- Future data: PostgreSQL + Redis
- AI role: extraction, explanation, negotiation language

## Runtime model

Two runtime paths are prepared:

1. Native runtime with local Node.js + Python
2. Container runtime with Docker Compose

Both paths aim at the same flow:

- frontend on `http://localhost:3000`
- backend on `http://localhost:8000`
- backend healthcheck on `http://localhost:8000/health`

## GitHub workflow

The repo is prepared for GitHub-based CI:

- [.github/workflows/ci.yml](/C:/Users/mmncc/Desktop/F%C3%BCr%20Codex/.github/workflows/ci.yml) runs backend tests plus frontend typecheck and production build
- [.github/dependabot.yml](/C:/Users/mmncc/Desktop/F%C3%BCr%20Codex/.github/dependabot.yml) keeps `npm` and `pip` dependencies under review
- [.gitattributes](/C:/Users/mmncc/Desktop/F%C3%BCr%20Codex/.gitattributes) normalizes line endings for cross-platform work

Suggested publish flow:

```powershell
"C:\Program Files\GitHub CLI\gh.exe" auth login
"C:\Program Files\Git\cmd\git.exe" init -b main
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "Initial AUTONOW foundation"
"C:\Program Files\GitHub CLI\gh.exe" repo create autonow --private --source . --remote origin --push
```

Or use the helper after GitHub login and Git identity setup:

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
gh auth login
.\scripts\publish-github.cmd -RepoName autonow
```

## Local prerequisites

Node.js and Python are installed on this machine.
Docker is still unavailable in the current shell.

Because Windows PATH refresh can lag behind fresh installs, the scripts in `scripts/` resolve common install locations directly instead of depending only on PATH.

Recommended toolchain:

- Node.js 22+
- npm 10+
- Python 3.12+
- Docker Desktop (optional, but recommended)

## Runtime scripts

Check environment:

```powershell
.\scripts\doctor.cmd
```

Start backend natively:

```powershell
.\scripts\run-backend.cmd -Bootstrap
```

Start frontend natively:

```powershell
.\scripts\run-frontend.cmd -Bootstrap
```

Run backend tests:

```powershell
.\scripts\test-backend.cmd
```

Run frontend quality gate:

```powershell
.\scripts\test-frontend.cmd
```

Run full stack with Docker:

```powershell
.\scripts\dev-compose.cmd
```

On Windows, `.cmd` wrappers are preferred because local PowerShell execution policy may block raw `.ps1` execution.

## Native runtime details

The backend script:

- creates `.venv` inside `backend/`
- installs `requirements.txt` and `requirements-dev.txt`
- starts `uvicorn app.main:app --reload`

The frontend script:

- installs npm dependencies when needed
- starts `next dev`

## Container runtime details

Container support is ready via:

- [docker-compose.yml](/C:/Users/mmncc/Desktop/Für%20Codex/docker-compose.yml)
- [frontend/Dockerfile](/C:/Users/mmncc/Desktop/Für%20Codex/frontend/Dockerfile)
- [backend/Dockerfile](/C:/Users/mmncc/Desktop/Für%20Codex/backend/Dockerfile)

This is useful once Docker Desktop is available on the machine.

## Planned commands

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Testing

Backend tests live in:

- [test_deal_engine.py](/C:/Users/mmncc/Desktop/Für%20Codex/backend/tests/test_deal_engine.py)
- [test_api.py](/C:/Users/mmncc/Desktop/Für%20Codex/backend/tests/test_api.py)

Frontend currently uses a lightweight quality gate:

- TypeScript typecheck
- Next.js production build

This is enough for the current phase because the frontend is still a thin intake shell over the backend.

## Phase 1 scope

- backend API for listing analysis
- frontend intake flow wired to backend
- reusable deal engine in Python
- SQLite-backed watchlist and portfolio persistence
- confidence guardrails for risky or incomplete listings
- negotiation guidance and operator notes for saved deals
- source-aware parsing and Hamburg buy-box assessment
- editable operator settings and saved search profiles
- clean separation between prototype and real product code

## Immediate next milestone

Now that runtimes are prepared and the first test gate passes, the next development target should be:

1. repository abstraction to support PostgreSQL after SQLite
2. semi-automatic source ingestion from saved search URLs
3. search profile execution history and dedupe
