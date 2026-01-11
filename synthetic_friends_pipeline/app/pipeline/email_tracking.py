import datetime
from pathlib import Path
from typing import Any, Iterable

import orjson

from app.config.hubspot_properties import CONTACT_PROPS
from app.config.settings import settings
from app.hubspot.client import HubSpotClient
from app.models.schemas import EmailEvent
from app.utils.log import get_logger

logger = get_logger("sf-email-tracking")

PIXEL_GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04"
    b"\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

EMAIL_PROP_KEYS = [
    CONTACT_PROPS["sf_email_first_tracked_at"],
    CONTACT_PROPS["sf_email_last_activity_at"],
    CONTACT_PROPS["sf_email_last_sent_at"],
    CONTACT_PROPS["sf_email_last_received_at"],
    CONTACT_PROPS["sf_email_last_opened_at"],
    CONTACT_PROPS["sf_email_last_clicked_at"],
    CONTACT_PROPS["sf_email_sent_count"],
    CONTACT_PROPS["sf_email_received_count"],
    CONTACT_PROPS["sf_email_open_count"],
    CONTACT_PROPS["sf_email_click_count"],
    CONTACT_PROPS["sf_email_last_subject"],
    CONTACT_PROPS["sf_email_last_thread_id"],
    CONTACT_PROPS["sf_email_last_message_id"],
    CONTACT_PROPS["sf_email_last_event_type"],
    CONTACT_PROPS["sf_email_last_direction"],
]


def _now_ms() -> int:
    return int(datetime.datetime.utcnow().timestamp() * 1000)


def _parse_occurred_at(value: str | None) -> int:
    if not value:
        return _now_ms()
    try:
        dt = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        try:
            return int(float(value))
        except Exception:
            return _now_ms()


def _normalize_email(email: str | None) -> str:
    return (email or "").strip().lower()


def _dedupe(items: Iterable[str]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        normalized = _normalize_email(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def _parse_int(value: Any) -> int:
    try:
        return int(float(value))
    except Exception:
        return 0


def _event_log_path() -> Path | None:
    path = (settings.EMAIL_EVENT_LOG_PATH or "").strip()
    if not path:
        return None
    return Path(path)


def _append_event_log(payload: dict) -> None:
    path = _event_log_path()
    if not path:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("ab") as handle:
            handle.write(orjson.dumps(payload))
            handle.write(b"\n")
    except Exception as exc:
        logger.warning("email tracking log write failed: %s", exc)


def _resolve_contact_emails(event: EmailEvent) -> list[str]:
    emails: list[str] = []
    if event.contact_email:
        emails.append(event.contact_email)
    if event.event_type == "received" and event.from_email:
        emails.append(event.from_email)
    if event.event_type in {"sent", "open", "click"}:
        emails.extend(event.to_emails or [])
        emails.extend(event.cc_emails or [])
    emails = _dedupe(emails)

    user = _normalize_email(event.user_email)
    if user:
        emails = [email for email in emails if _normalize_email(email) != user]
    return emails


def _build_updates(current: dict, event: EmailEvent, event_ms: int) -> dict:
    updates: dict[str, Any] = {
        CONTACT_PROPS["sf_email_last_activity_at"]: event_ms,
        CONTACT_PROPS["sf_email_last_event_type"]: event.event_type,
    }
    if event.direction:
        updates[CONTACT_PROPS["sf_email_last_direction"]] = event.direction

    if not current.get(CONTACT_PROPS["sf_email_first_tracked_at"]):
        updates[CONTACT_PROPS["sf_email_first_tracked_at"]] = event_ms

    if event.subject:
        updates[CONTACT_PROPS["sf_email_last_subject"]] = event.subject[:255]
    if event.thread_id:
        updates[CONTACT_PROPS["sf_email_last_thread_id"]] = event.thread_id
    if event.message_id:
        updates[CONTACT_PROPS["sf_email_last_message_id"]] = event.message_id

    if event.event_type == "sent":
        updates[CONTACT_PROPS["sf_email_last_sent_at"]] = event_ms
        updates[CONTACT_PROPS["sf_email_sent_count"]] = _parse_int(
            current.get(CONTACT_PROPS["sf_email_sent_count"])
        ) + 1
    elif event.event_type == "received":
        updates[CONTACT_PROPS["sf_email_last_received_at"]] = event_ms
        updates[CONTACT_PROPS["sf_email_received_count"]] = _parse_int(
            current.get(CONTACT_PROPS["sf_email_received_count"])
        ) + 1
    elif event.event_type == "open":
        updates[CONTACT_PROPS["sf_email_last_opened_at"]] = event_ms
        updates[CONTACT_PROPS["sf_email_open_count"]] = _parse_int(
            current.get(CONTACT_PROPS["sf_email_open_count"])
        ) + 1
    elif event.event_type == "click":
        updates[CONTACT_PROPS["sf_email_last_clicked_at"]] = event_ms
        updates[CONTACT_PROPS["sf_email_click_count"]] = _parse_int(
            current.get(CONTACT_PROPS["sf_email_click_count"])
        ) + 1

    return updates


def _event_payload(event: EmailEvent, request_meta: dict | None, event_ms: int) -> dict:
    if hasattr(event, "model_dump"):
        base = event.model_dump()
    else:
        base = event.dict()
    received_at = datetime.datetime.utcfromtimestamp(event_ms / 1000).replace(microsecond=0).isoformat() + "Z"
    payload = {
        **base,
        "received_at": received_at,
        "received_at_ms": event_ms,
    }
    if request_meta:
        payload["request_meta"] = request_meta
    return payload


async def handle_email_event(event: EmailEvent, request_meta: dict | None = None) -> dict:
    event_ms = _parse_occurred_at(event.occurred_at)
    payload = _event_payload(event, request_meta, event_ms)
    _append_event_log(payload)

    try:
        hs = HubSpotClient()
    except Exception as exc:
        logger.warning("email tracking HubSpot client unavailable: %s", exc)
        return {"ok": True, "logged": True, "hubspot": False}

    contact_emails = _resolve_contact_emails(event)
    if not contact_emails:
        return {"ok": True, "logged": True, "hubspot": False}

    for email in contact_emails:
        try:
            contact = await hs.search_contact_by_email(email, properties=EMAIL_PROP_KEYS)
            if contact:
                updates = _build_updates(contact.get("properties", {}), event, event_ms)
                await hs.update_contact(contact["id"], updates)
            else:
                updates = _build_updates({}, event, event_ms)
                await hs.create_contact({"email": email, **updates})
        except Exception as exc:
            logger.warning("email tracking HubSpot update failed (%s): %s", email, exc)

    return {"ok": True, "logged": True, "hubspot": True}
