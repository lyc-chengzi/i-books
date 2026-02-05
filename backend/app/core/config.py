from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IBOOKS_", env_file=".env", extra="ignore")

    # Use the common instance name format used by SSMS, e.g. .\SQLEXPRESS
    db_server: str = r".\SQLEXPRESS"
    db_name: str = "iBooks"
    db_trusted_connection: bool = True
    db_user: str | None = None
    db_password: str | None = None
    db_driver: str = "ODBC Driver 17 for SQL Server"

    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 60

    # Cookie-based auth (for local deployment): store JWT in HttpOnly cookie.
    auth_cookie_name: str = "ibooks_auth"
    auth_cookie_samesite: str = "lax"  # lax|strict|none
    auth_cookie_secure: bool = False

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"

    # If enabled, FastAPI will serve the built frontend (Vite dist) as static files.
    # This is useful for local Windows deployment: run one process and open http://localhost:8000
    serve_frontend: bool = False
    # Path can be absolute or repo-root-relative (when running from backend/).
    frontend_dist_dir: str = "../frontend/dist"


settings = Settings()
