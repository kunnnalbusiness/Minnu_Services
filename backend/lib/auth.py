from __future__ import annotations

import os
import secrets
from typing import Any

from lib.db import db

ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
SECOND_ADMIN_EMAIL = (os.environ.get("SECOND_ADMIN_EMAIL") or "").strip().lower()
SECOND_ADMIN_PASSWORD = os.environ.get("SECOND_ADMIN_PASSWORD") or ""


def configured_users() -> dict[str, dict[str, str]]:
    users: dict[str, dict[str, str]] = {}
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        users[ADMIN_EMAIL] = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "role": "admin"}
    if SECOND_ADMIN_EMAIL and SECOND_ADMIN_PASSWORD:
        users[SECOND_ADMIN_EMAIL] = {
            "email": SECOND_ADMIN_EMAIL,
            "password": SECOND_ADMIN_PASSWORD,
            "role": "admin",
        }
    return users


async def ensure_admin_user() -> dict[str, Any]:
    payload = {**configured_users()[ADMIN_EMAIL], "active": True}
    try:
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": payload}, upsert=True)
        second = {**configured_users()[SECOND_ADMIN_EMAIL], "active": True}
        await db.users.update_one({"email": SECOND_ADMIN_EMAIL}, {"$set": second}, upsert=True)
    except Exception:
        pass
    return payload


async def validate_admin_login(email: str, password: str) -> bool:
    normalized_email = (email or "").strip().lower()
    normalized_password = (password or "").strip()

    configured = configured_users()
    if normalized_email in configured and secrets.compare_digest(
        normalized_password, configured[normalized_email]["password"]
    ):
        await ensure_admin_user()
        return True

    try:
        user = await db.users.find_one({"email": normalized_email})
    except Exception:
        user = None

    if not user:
        return False

    return str(user.get("email", "")).lower() == normalized_email and str(user.get("password", "")) == normalized_password
