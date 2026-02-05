from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.category import Category
from app.models.category_tag import CategoryTag
from app.models.transaction import Transaction
from app.models.transaction_tag import TransactionTag
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryMove, CategoryNodeOut, CategoryUpdate
from app.schemas.tag import CategoryTagCreate, CategoryTagOut

router = APIRouter(prefix="/config/categories", tags=["config"])


def _ensure_first_level_expense_category(db: Session, current_user: User, category_id: int) -> Category:
    row = db.get(Category, category_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found")
    if row.type != "expense":
        raise HTTPException(status_code=400, detail="Tags are only supported for expense categories")
    if row.parent_id is None:
        raise HTTPException(status_code=400, detail="Tags must be bound to a first-level expense category")

    parent = db.get(Category, row.parent_id)
    if not parent or parent.user_id != current_user.id or parent.type != "expense":
        raise HTTPException(status_code=400, detail="Invalid category parent")
    if parent.parent_id is not None:
        raise HTTPException(status_code=400, detail="Tags must be bound to a first-level expense category")

    return row


def _build_tree(rows: list[Category]) -> list[CategoryNodeOut]:
    nodes: dict[int, CategoryNodeOut] = {}
    for r in rows:
        nodes[r.id] = CategoryNodeOut(
            id=r.id,
            type=r.type,
            name=r.name,
            parentId=r.parent_id,
            sortOrder=r.sort_order,
            isActive=r.is_active,
            isLeaf=True,  # temporary, recomputed later
            children=[],
        )

    roots: list[CategoryNodeOut] = []
    for r in rows:
        node = nodes[r.id]
        if r.parent_id and r.parent_id in nodes:
            nodes[r.parent_id].children.append(node)
        else:
            roots.append(node)

    def finalize(n: CategoryNodeOut) -> None:
        n.children.sort(key=lambda x: (x.sortOrder, x.id))
        n.isLeaf = len(n.children) == 0
        for c in n.children:
            finalize(c)

    roots.sort(key=lambda x: (x.sortOrder, x.id))
    for root in roots:
        finalize(root)

    return roots


@router.get("/tree", response_model=list[CategoryNodeOut])
def get_category_tree(
    type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryNodeOut]:
    stmt: Select[tuple[Category]] = select(Category).where(Category.user_id == current_user.id)
    if type:
        if type not in ("income", "expense"):
            raise HTTPException(status_code=400, detail="Invalid type")
        stmt = stmt.where(Category.type == type)

    rows = db.scalars(stmt.order_by(Category.sort_order.asc(), Category.id.asc())).all()
    return _build_tree(rows)


@router.post("", response_model=CategoryNodeOut)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryNodeOut:
    if payload.type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    parent_id: int | None = None
    if payload.parentId is not None:
        parent = db.get(Category, payload.parentId)
        if not parent or parent.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid parentId")
        if not parent.is_active:
            raise HTTPException(status_code=400, detail="Parent category is inactive")
        if parent.type != payload.type:
            raise HTTPException(status_code=400, detail="Income/expense type mismatch")
        parent_id = parent.id

    sort_order: int
    if payload.sortOrder is not None:
        sort_order = payload.sortOrder
    else:
        max_sort = db.scalar(
            select(func.max(Category.sort_order)).where(
                Category.user_id == current_user.id,
                Category.type == payload.type,
                Category.parent_id == parent_id,
            )
        )
        if max_sort is None:
            sort_order = 0
        else:
            sort_order = int(max_sort) + 10

    row = Category(
        user_id=current_user.id,
        type=payload.type,
        name=payload.name,
        parent_id=parent_id,
        sort_order=sort_order,
        is_active=payload.isActive,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return CategoryNodeOut(
        id=row.id,
        type=row.type,
        name=row.name,
        parentId=row.parent_id,
        sortOrder=row.sort_order,
        isActive=row.is_active,
        isLeaf=True,
        children=[],
    )


@router.get("/{category_id}/tags", response_model=list[CategoryTagOut])
def list_category_tags(
    category_id: int,
    activeOnly: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryTagOut]:
    category = _ensure_first_level_expense_category(db, current_user, category_id)

    stmt = select(CategoryTag).where(
        CategoryTag.user_id == current_user.id,
        CategoryTag.category_id == category.id,
    )
    if activeOnly:
        stmt = stmt.where(CategoryTag.is_active == True)  # noqa: E712

    rows = db.scalars(stmt.order_by(CategoryTag.id.asc())).all()
    return [
        CategoryTagOut(id=r.id, categoryId=r.category_id, name=r.name, isActive=r.is_active) for r in rows
    ]


@router.post("/{category_id}/tags", response_model=CategoryTagOut)
def create_category_tag(
    category_id: int,
    payload: CategoryTagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryTagOut:
    category = _ensure_first_level_expense_category(db, current_user, category_id)

    existing = db.scalar(
        select(CategoryTag).where(
            CategoryTag.user_id == current_user.id,
            CategoryTag.category_id == category.id,
            CategoryTag.name == payload.name,
        )
    )
    if existing is not None:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="Tag name already exists")
        existing.is_active = True
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return CategoryTagOut(
            id=existing.id,
            categoryId=existing.category_id,
            name=existing.name,
            isActive=existing.is_active,
        )

    row = CategoryTag(
        user_id=current_user.id,
        category_id=category.id,
        name=payload.name,
        is_active=payload.isActive,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return CategoryTagOut(id=row.id, categoryId=row.category_id, name=row.name, isActive=row.is_active)


@router.delete("/{category_id}/tags/{tag_id}")
def delete_category_tag(
    category_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    category = _ensure_first_level_expense_category(db, current_user, category_id)

    row = db.get(CategoryTag, tag_id)
    if not row or row.user_id != current_user.id or row.category_id != category.id:
        raise HTTPException(status_code=404, detail="Tag not found")

    referenced = (
        db.scalar(
            select(TransactionTag.transaction_id).where(TransactionTag.tag_id == row.id).limit(1)
        )
        is not None
    )
    if referenced:
        row.is_active = False
        db.add(row)
        db.commit()
        return {"ok": True, "mode": "disabled"}

    db.delete(row)
    db.commit()
    return {"ok": True, "mode": "deleted"}


@router.patch("/{category_id}", response_model=CategoryNodeOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryNodeOut:
    row = db.get(Category, category_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name is not None:
        row.name = payload.name
    if payload.sortOrder is not None:
        row.sort_order = payload.sortOrder
    if payload.isActive is not None:
        row.is_active = payload.isActive

    db.add(row)
    db.commit()
    db.refresh(row)

    has_child = (
        db.scalar(
            select(Category.id)
            .where(Category.user_id == current_user.id, Category.parent_id == row.id)
            .limit(1)
        )
        is not None
    )

    return CategoryNodeOut(
        id=row.id,
        type=row.type,
        name=row.name,
        parentId=row.parent_id,
        sortOrder=row.sort_order,
        isActive=row.is_active,
        isLeaf=not has_child,
        children=[],
    )


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = db.get(Category, category_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    has_child = db.scalar(
        select(Category.id)
        .where(Category.user_id == current_user.id, Category.parent_id == row.id, Category.is_active == True)
        .limit(1)  # noqa: E712
    )
    if has_child is not None:
        raise HTTPException(status_code=400, detail="Category has children; delete/disable children first")

    referenced = (
        db.scalar(
            select(Transaction.id)
            .where(Transaction.user_id == current_user.id, Transaction.category_id == row.id)
            .limit(1)
        )
        is not None
    )
    if referenced:
        row.is_active = False
        db.add(row)
        db.commit()
        return {"ok": True, "mode": "disabled"}

    db.delete(row)
    db.commit()
    return {"ok": True, "mode": "deleted"}


@router.patch("/{category_id}/move")
def move_category(
    category_id: int,
    payload: CategoryMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = db.get(Category, category_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    new_parent_id: int | None = None
    if payload.parentId is not None:
        if payload.parentId == row.id:
            raise HTTPException(status_code=400, detail="parentId must not be self")

        parent = db.get(Category, payload.parentId)
        if not parent or parent.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid parentId")
        if parent.type != row.type:
            raise HTTPException(status_code=400, detail="Income/expense type mismatch")
        if not parent.is_active:
            raise HTTPException(status_code=400, detail="Parent category is inactive")

        # Prevent cycles: walk up from parent to root
        cursor = parent
        while cursor.parent_id is not None:
            if cursor.parent_id == row.id:
                raise HTTPException(status_code=400, detail="Cannot move under descendant")
            cursor = db.get(Category, cursor.parent_id)
            if not cursor:
                break

        new_parent_id = parent.id

    old_parent_id = row.parent_id
    old_parent_changed = old_parent_id != new_parent_id

    # Load siblings in target parent
    siblings = db.scalars(
        select(Category)
        .where(
            Category.user_id == current_user.id,
            Category.type == row.type,
            Category.parent_id == new_parent_id,
        )
        .order_by(Category.sort_order.asc(), Category.id.asc())
    ).all()

    # Remove row if it is already in the list
    siblings = [s for s in siblings if s.id != row.id]

    insert_index = payload.index
    if insert_index < 0:
        insert_index = 0
    if insert_index > len(siblings):
        insert_index = len(siblings)

    siblings.insert(insert_index, row)

    # Re-assign sort_order with gaps to reduce churn
    for i, s in enumerate(siblings):
        s.sort_order = i * 10
        if s.id == row.id:
            s.parent_id = new_parent_id

    db.commit()

    # If moved across parents, also re-pack old parent's remaining siblings a bit
    if old_parent_changed:
        old_siblings = db.scalars(
            select(Category)
            .where(
                Category.user_id == current_user.id,
                Category.type == row.type,
                Category.parent_id == old_parent_id,
            )
            .order_by(Category.sort_order.asc(), Category.id.asc())
        ).all()
        for i, s in enumerate(old_siblings):
            s.sort_order = i * 10
        db.commit()

    return {"ok": True}
