from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routers import api_router
from app.core.config import settings
from app.db.init_db import ensure_seed_data
from app.db.session import SessionLocal

app = FastAPI(title="iBooks API")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"] ,
)

app.include_router(api_router, prefix="/api")


def _resolve_frontend_dist_dir() -> Path:
    dist_dir = Path(settings.frontend_dist_dir)
    if dist_dir.is_absolute():
        return dist_dir

    # When running via `uvicorn app.main:app` from backend/, this resolves correctly.
    # If running from elsewhere, it still works if frontend_dist_dir is absolute.
    backend_dir = Path(__file__).resolve().parents[1]
    return (backend_dir / dist_dir).resolve()


_frontend_dist_dir = _resolve_frontend_dist_dir()

if settings.serve_frontend and _frontend_dist_dir.exists():
    # Mount AFTER /api so API routes win.
    app.mount(
        "/",
        StaticFiles(directory=str(_frontend_dist_dir), html=True),
        name="frontend",
    )


@app.exception_handler(StarletteHTTPException)
async def spa_fallback(request, exc: StarletteHTTPException):
    # For client-side routes like /ledger or /stats/xxx, return index.html.
    if (
        exc.status_code == 404
        and settings.serve_frontend
        and _frontend_dist_dir.exists()
        and not request.url.path.startswith("/api")
    ):
        last_segment = request.url.path.rsplit("/", 1)[-1]
        if "." not in last_segment:
            index_file = _frontend_dist_dir / "index.html"
            if index_file.exists():
                return FileResponse(str(index_file))

    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.on_event("startup")
def on_startup() -> None:
    db = SessionLocal()
    try:
        ensure_seed_data(db)
    finally:
        db.close()
