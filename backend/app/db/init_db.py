from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.category import Category
from app.models.user import User


def ensure_seed_data(db: Session) -> None:
    # Create a default user + account items when database is empty.
    user = db.query(User).first()
    if not user:
        user = User(username="admin", password_hash=hash_password("admin"))
        db.add(user)
        db.commit()
        db.refresh(user)

    # If migrations haven't been applied yet, don't fail startup.
    engine = db.get_bind()
    if not inspect(engine).has_table("categories"):
        return

    has_category = db.query(Category).filter(Category.user_id == user.id).first()
    if has_category:
        return

    expense_root = Category(user_id=user.id, type="expense", name="支出", parent_id=None, sort_order=0, is_active=True)
    income_root = Category(user_id=user.id, type="income", name="收入", parent_id=None, sort_order=0, is_active=True)
    db.add_all([expense_root, income_root])
    db.commit()
    db.refresh(expense_root)
    db.refresh(income_root)

    db.add_all(
        [
            Category(
                user_id=user.id,
                type="expense",
                name="默认支出",
                parent_id=expense_root.id,
                sort_order=0,
                is_active=True,
            ),
            Category(
                user_id=user.id,
                type="income",
                name="默认收入",
                parent_id=income_root.id,
                sort_order=0,
                is_active=True,
            ),
        ]
    )
    db.commit()
