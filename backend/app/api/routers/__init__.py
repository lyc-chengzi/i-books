from fastapi import APIRouter

from app.api.routers import auth, bank_accounts, categories, stats, transactions, transfers, users, transaction_audit_logs

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(bank_accounts.router)
api_router.include_router(categories.router)
api_router.include_router(transactions.router)
api_router.include_router(transfers.router)
api_router.include_router(stats.router)
api_router.include_router(users.router)
api_router.include_router(transaction_audit_logs.router)
