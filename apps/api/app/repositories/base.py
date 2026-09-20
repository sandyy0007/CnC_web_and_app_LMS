"""Scoped repository base.

Every data-access function REQUIRES an authorization context. The tenant filter is injected by
this layer (including for aggregation pipelines), so an endpoint author cannot accidentally write
an unscoped query — the MongoDB equivalent of the PostgreSQL RLS backstop in the HOD SRS.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.core.errors import Conflict, ScopeForbidden, ValidationError
from app.db.mongo import get_db, serialize

MAX_PAGE_SIZE = 200


@dataclass
class Page:
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int

    @property
    def total_pages(self) -> int:
        return max(1, math.ceil(self.total / self.page_size)) if self.page_size else 1

    def to_response(self) -> dict[str, Any]:
        return {
            "items": serialize(self.items),
            "pagination": {
                "page": self.page,
                "pageSize": self.page_size,
                "total": self.total,
                "totalPages": self.total_pages,
                "hasNext": self.page < self.total_pages,
                "hasPrev": self.page > 1,
            },
        }


def escape_regex(value: str) -> str:
    return re.escape(value.strip())


class ScopedRepository:
    """Subclass per collection; `collection` is the only required attribute."""

    collection: str = ""
    #: When False, HOD department narrowing is not applied (e.g. college-level catalogues).
    department_bound: bool = True
    #: Fields a free-text search may touch.
    search_fields: tuple[str, ...] = ()
    default_sort: tuple[str, int] = ("createdAt", DESCENDING)
    #: Soft-delete only — historical records are never hard-removed (§37).
    soft_delete: bool = True
    extra_sortable: tuple[str, ...] = ()
    #: False when documents carry no `batchId`. A trainer's scope then narrows by the
    #: departments they are assigned to instead — filtering on a field the collection does
    #: not have would silently match nothing.
    batch_scoped: bool = True

    _BASE_SORTABLE = frozenset(
        {
            "createdAt", "updatedAt", "name", "status", "date", "score", "dueAt", "enrolledAt",
            "at", "startsAt", "finalScore", "rollNumber", "attendancePct", "avgScore", "title",
            "code", "lastActiveAt", "email", "role", "issuedAt", "totalScore",
        }
    )

    def __init__(self, ctx: ScopeContext) -> None:
        if ctx is None:  # pragma: no cover - programming error
            raise RuntimeError("ScopedRepository requires an authorization context")
        self.ctx = ctx
        self.db = get_db()

    # ------------------------------------------------------------------ internals
    @property
    def col(self):
        return self.db[self.collection]

    def scope_filter(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        base = self.ctx.base_filter()
        if not self.batch_scoped and "batchId" in base:
            from app.authz.roles import Role

            base.pop("batchId", None)
            if self.ctx.role is Role.TRAINER:
                base["departmentId"] = {"$in": list(self.ctx.department_ids)}
        if not self.department_bound:
            base.pop("departmentId", None)
            base.pop("batchId", None)
        merged = {**base, **(extra or {})}
        if self.soft_delete:
            merged.setdefault("deletedAt", None)
        return merged

    def _sort(self, sort_by: str | None, sort_dir: str | None) -> list[tuple[str, int]]:
        if sort_by:
            allowed = self._BASE_SORTABLE | set(self.search_fields) | set(self.extra_sortable)
            if sort_by not in allowed:
                raise ValidationError(f"Cannot sort by '{sort_by}'")
            direction = DESCENDING if (sort_dir or "asc").lower() == "desc" else ASCENDING
            return [(sort_by, direction)]
        return [self.default_sort]

    def _search_clause(self, search: str | None) -> dict[str, Any]:
        if not search or not self.search_fields:
            return {}
        pattern = escape_regex(search)
        if not pattern:
            return {}
        return {"$or": [{f: {"$regex": pattern, "$options": "i"}} for f in self.search_fields]}

    # ------------------------------------------------------------------ reads
    async def list(
        self,
        *,
        filters: dict[str, Any] | None = None,
        search: str | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
        page: int = 1,
        page_size: int = 20,
        projection: dict[str, Any] | None = None,
    ) -> Page:
        page = max(1, int(page or 1))
        page_size = min(MAX_PAGE_SIZE, max(1, int(page_size or 20)))
        query = self.scope_filter(filters)
        search_clause = self._search_clause(search)
        if search_clause:
            query = {"$and": [query, search_clause]}
        total = await self.col.count_documents(query)
        cursor = (
            self.col.find(query, projection)
            .sort(self._sort(sort_by, sort_dir))
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        items = await cursor.to_list(length=page_size)
        return Page(items=items, total=total, page=page, page_size=page_size)

    async def find_all(
        self,
        filters: dict[str, Any] | None = None,
        *,
        projection: dict[str, Any] | None = None,
        limit: int = 5000,
        sort: list[tuple[str, int]] | None = None,
    ) -> list[dict[str, Any]]:
        # `.limit()` is applied to the cursor, not just passed to `to_list`: the limit is then
        # enforced by the server rather than being a client-side hint.
        cursor = self.col.find(self.scope_filter(filters), projection)
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.limit(limit).to_list(length=limit)

    async def find_one(
        self, filters: dict[str, Any], *, projection: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        return await self.col.find_one(self.scope_filter(filters), projection)

    async def get(
        self, resource_id: Any, *, projection: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Scope check 5. Out-of-scope is indistinguishable from non-existent."""
        try:
            oid = ObjectId(str(resource_id))
        except Exception as exc:
            raise ValidationError("Not a valid identifier") from exc
        doc = await self.col.find_one(self.scope_filter({"_id": oid}), projection)
        if not doc:
            raise ScopeForbidden()
        return doc

    async def count(self, filters: dict[str, Any] | None = None) -> int:
        return await self.col.count_documents(self.scope_filter(filters))

    async def aggregate(
        self, pipeline: Sequence[dict[str, Any]], *, extra_match: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Scope is prepended as the first `$match` so it cannot be bypassed downstream."""
        scoped = [{"$match": self.scope_filter(extra_match)}, *pipeline]
        return await self.col.aggregate(scoped).to_list(length=None)

    async def distinct(self, field: str, filters: dict[str, Any] | None = None) -> list[Any]:
        return await self.col.distinct(field, self.scope_filter(filters))

    # ------------------------------------------------------------------ writes
    async def insert(
        self,
        data: dict[str, Any],
        *,
        audit_entity: str | None = None,
        conflict_message: str | None = None,
    ) -> dict[str, Any]:
        doc = {**self.ctx.stamp(), **data}
        # `setdefault`, not an override: some documents (e.g. assessment version snapshots)
        # carry a meaningful `version` of their own.
        doc.setdefault("deletedAt", None)
        doc.setdefault("version", 1)
        try:
            result = await self.col.insert_one(doc)
        except DuplicateKeyError as exc:
            raise Conflict(
                conflict_message or "A record with these details already exists"
            ) from exc
        doc["_id"] = result.inserted_id
        await write_audit(
            self.ctx,
            action="create",
            entity_type=audit_entity or self.collection,
            entity_id=result.inserted_id,
            after=doc,
        )
        return doc

    async def update(
        self,
        resource_id: Any,
        patch: dict[str, Any],
        *,
        expected_version: int | None = None,
        audit_entity: str | None = None,
        unset: Iterable[str] = (),
    ) -> dict[str, Any]:
        before = await self.get(resource_id)
        if expected_version is not None and before.get("version", 1) != expected_version:
            # Optimistic locking: the second writer is told, not silently overwritten (SRS §9).
            raise Conflict("This record was changed by someone else — reload and try again")
        update: dict[str, Any] = {"$set": {**patch, **self.ctx.touch()}, "$inc": {"version": 1}}
        if unset:
            update["$unset"] = {field: "" for field in unset}
        await self.col.update_one({"_id": before["_id"]}, update)
        after = await self.col.find_one({"_id": before["_id"]})
        await write_audit(
            self.ctx,
            action="update",
            entity_type=audit_entity or self.collection,
            entity_id=before["_id"],
            before=before,
            after=after,
        )
        return after

    async def soft_remove(self, resource_id: Any, *, reason: str | None = None) -> dict[str, Any]:
        """History is preserved: records are marked, never destroyed (§37)."""
        from app.authz.guards import utcnow

        before = await self.get(resource_id)
        await self.col.update_one(
            {"_id": before["_id"]},
            {
                "$set": {
                    "deletedAt": utcnow(),
                    "deletedBy": self.ctx.user_id,
                    "deleteReason": reason,
                    "status": "archived",
                    **self.ctx.touch(),
                },
                "$inc": {"version": 1},
            },
        )
        await write_audit(
            self.ctx,
            action="delete",
            entity_type=self.collection,
            entity_id=before["_id"],
            before=before,
            detail=reason,
        )
        return before

    async def bulk_insert(self, docs: list[dict[str, Any]]) -> list[ObjectId]:
        if not docs:
            return []
        stamped = []
        for d in docs:
            doc = {**self.ctx.stamp(), **d}
            doc.setdefault("deletedAt", None)
            doc.setdefault("version", 1)
            stamped.append(doc)
        result = await self.col.insert_many(stamped, ordered=False)
        return list(result.inserted_ids)
