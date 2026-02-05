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

    cors_origins: str = "http://localhost:5173"


settings = Settings()
