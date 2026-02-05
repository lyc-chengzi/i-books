from __future__ import annotations

from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def build_connection_url() -> str:
    # Use ODBC connection string to avoid URL-escaping pain on Windows instance names.
    # Some .env examples may contain double backslashes (e.g. .\\SQLEXPRESS). ODBC expects .\SQLEXPRESS.
    server = settings.db_server.replace("\\\\", "\\")
    parts: list[str] = [
        f"DRIVER={{{settings.db_driver}}}",
        f"SERVER={server}",
        f"DATABASE={settings.db_name}",
        "TrustServerCertificate=yes",
    ]

    if settings.db_trusted_connection:
        parts.append("Trusted_Connection=yes")
    else:
        if not settings.db_user or not settings.db_password:
            raise ValueError("SQL 登录需要设置 IBOOKS_DB_USER 和 IBOOKS_DB_PASSWORD")
        parts.append(f"UID={settings.db_user}")
        parts.append(f"PWD={settings.db_password}")

    odbc_str = ";".join(parts)
    return "mssql+pyodbc:///?odbc_connect=" + quote_plus(odbc_str)


engine = create_engine(
    build_connection_url(),
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
