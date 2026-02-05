from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.on_event("startup")
def on_startup() -> None:
    db = SessionLocal()
    try:
        ensure_seed_data(db)
    finally:
        db.close()
