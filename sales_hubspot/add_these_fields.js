#!/usr/bin/env python3
"""
Create Synthetic Friends GTM custom properties in HubSpot (Contacts).

Assumes HUBSPOT_PRIVATE_APP_TOKEN and HUBSPOT_BASE_URL are in .env

Run:
  pip install python-dotenv httpx
  python scripts/create_hubspot_properties.py
"""

import os
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

HUBSPOT_TOKEN = os.getenv("HUBSPOT_PRIVATE_APP_TOKEN")
HUBSPOT_BASE_URL = (os.getenv("HUBSPOT_BASE_URL") or "https://api.hubapi.com").rstrip("/")

if not HUBSPOT_TOKEN:
    raise SystemExit("Missing HUBSPOT_PRIVATE_APP_TOKEN in .env")


# 8 high-signal GTM properties (Contacts)
PROPERTIES: List[Dict[str, Any]] = [
    # 1) Lead score (numeric 0-100; your pipeline can write this)
    {
        "name": "sf_lead_score",
        "label": "SF Lead Score",
        "description": "Synthetic Friends lead score (0-100).",
        "groupName": "contactinformation",
        "type": "number",
        "fieldType": "number",
    },
    # 2) Lead source (where did this contact come from in your process)
    {
        "name": "sf_lead_source",
        "label": "SF Lead Source",
        "description": "Source of this lead (e.g., manual, apollo, clearbit, referral, event).",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Manual", "value": "manual"},
            {"label": "Apollo", "value": "apollo"},
            {"label": "Clearbit", "value": "clearbit"},
            {"label": "Referral", "value": "referral"},
            {"label": "Event", "value": "event"},
            {"label": "Inbound", "value": "inbound"},
            {"label": "Other", "value": "other"},
        ],
    },
    # 3) Engagement level (your automation can set this based on signals)
    {
        "name": "sf_engagement_level",
        "label": "SF Engagement Level",
        "description": "Engagement / intent bucket from outreach signals.",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Cold", "value": "cold"},
            {"label": "Warm", "value": "warm"},
            {"label": "Hot", "value": "hot"},
        ],
    },
    # 4) Synthetic Friends lifecycle stage (custom; separate from HubSpot default)
    {
        "name": "sf_lifecycle_stage",
        "label": "SF Lifecycle Stage",
        "description": "Synthetic Friends pipeline stage (custom).",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Targeted", "value": "targeted"},
            {"label": "Contact Identified", "value": "contact_identified"},
            {"label": "Enriched", "value": "enriched"},
            {"label": "Emailed", "value": "emailed"},
            {"label": "Replied", "value": "replied"},
            {"label": "Call Booked", "value": "call_booked"},
            {"label": "Pilot Proposed", "value": "pilot_proposed"},
            {"label": "Pilot Live", "value": "pilot_live"},
            {"label": "Closed Won", "value": "closed_won"},
            {"label": "Closed Lost", "value": "closed_lost"},
        ],
    },
    # 5) Industry vertical (simple but powerful for messaging + reporting)
    {
        "name": "sf_industry_vertical",
        "label": "SF Industry Vertical",
        "description": "Vertical for targeting/messaging (e.g., restaurants, retail, hospitality).",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Restaurants", "value": "restaurants"},
            {"label": "Hospitality", "value": "hospitality"},
            {"label": "Retail", "value": "retail"},
            {"label": "Fitness", "value": "fitness"},
            {"label": "Healthcare", "value": "healthcare"},
            {"label": "Services", "value": "services"},
            {"label": "Other", "value": "other"},
        ],
    },
    # 6) Preferred channel (lets you route outreach correctly)
    {
        "name": "sf_preferred_channel",
        "label": "SF Preferred Channel",
        "description": "Best outreach channel for this contact.",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Email", "value": "email"},
            {"label": "SMS/iMessage", "value": "sms_imessage"},
            {"label": "Phone Call", "value": "phone"},
            {"label": "LinkedIn", "value": "linkedin"},
            {"label": "Other", "value": "other"},
        ],
    },
    # 7) Seen demo (your requested replacement)
    {
        "name": "sf_seen_demo",
        "label": "SF Seen Demo",
        "description": "Has this contact seen the Synthetic Friends demo?",
        "groupName": "contactinformation",
        "type": "bool",
        "fieldType": "booleancheckbox",
    },
    # 8) Deal probability (numeric 0-100; can be set by your scoring)
    {
        "name": "sf_deal_probability",
        "label": "SF Deal Probability",
        "description": "Estimated probability to close (0-100).",
        "groupName": "contactinformation",
        "type": "number",
        "fieldType": "number",
    },
    # 9) Email tracking rollups (counts + last activity)
    {
        "name": "sf_email_sent_count",
        "label": "SF Email Sent Count",
        "description": "Number of tracked outbound emails sent to this contact.",
        "groupName": "contactinformation",
        "type": "number",
        "fieldType": "number",
    },
    {
        "name": "sf_email_received_count",
        "label": "SF Email Received Count",
        "description": "Number of tracked inbound emails received from this contact.",
        "groupName": "contactinformation",
        "type": "number",
        "fieldType": "number",
    },
    {
        "name": "sf_email_open_count",
        "label": "SF Email Open Count",
        "description": "Total tracked opens for this contact.",
        "groupName": "contactinformation",
        "type": "number",
        "fieldType": "number",
    },
    {
        "name": "sf_email_click_count",
        "label": "SF Email Click Count",
        "description": "Total tracked clicks for this contact.",
        "groupName": "contactinformation",
        "type": "number",
        "fieldType": "number",
    },
    # 10) Email tracking timestamps
    {
        "name": "sf_email_first_tracked_at",
        "label": "SF Email First Tracked At",
        "description": "First time this contact was tracked via email.",
        "groupName": "contactinformation",
        "type": "datetime",
        "fieldType": "date",
    },
    {
        "name": "sf_email_last_activity_at",
        "label": "SF Email Last Activity At",
        "description": "Most recent tracked email activity timestamp.",
        "groupName": "contactinformation",
        "type": "datetime",
        "fieldType": "date",
    },
    {
        "name": "sf_email_last_sent_at",
        "label": "SF Email Last Sent At",
        "description": "Most recent outbound email to this contact.",
        "groupName": "contactinformation",
        "type": "datetime",
        "fieldType": "date",
    },
    {
        "name": "sf_email_last_received_at",
        "label": "SF Email Last Received At",
        "description": "Most recent inbound email from this contact.",
        "groupName": "contactinformation",
        "type": "datetime",
        "fieldType": "date",
    },
    {
        "name": "sf_email_last_opened_at",
        "label": "SF Email Last Opened At",
        "description": "Most recent tracked email open.",
        "groupName": "contactinformation",
        "type": "datetime",
        "fieldType": "date",
    },
    {
        "name": "sf_email_last_clicked_at",
        "label": "SF Email Last Clicked At",
        "description": "Most recent tracked email click.",
        "groupName": "contactinformation",
        "type": "datetime",
        "fieldType": "date",
    },
    # 11) Email tracking metadata
    {
        "name": "sf_email_last_subject",
        "label": "SF Email Last Subject",
        "description": "Subject line of the last tracked email event.",
        "groupName": "contactinformation",
        "type": "string",
        "fieldType": "text",
    },
    {
        "name": "sf_email_last_thread_id",
        "label": "SF Email Last Thread ID",
        "description": "Latest tracked email thread ID (Gmail).",
        "groupName": "contactinformation",
        "type": "string",
        "fieldType": "text",
    },
    {
        "name": "sf_email_last_message_id",
        "label": "SF Email Last Message ID",
        "description": "Latest tracked email message ID (Gmail).",
        "groupName": "contactinformation",
        "type": "string",
        "fieldType": "text",
    },
    {
        "name": "sf_email_last_event_type",
        "label": "SF Email Last Event Type",
        "description": "Last tracked email event type.",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Sent", "value": "sent"},
            {"label": "Received", "value": "received"},
            {"label": "Open", "value": "open"},
            {"label": "Click", "value": "click"},
        ],
    },
    {
        "name": "sf_email_last_direction",
        "label": "SF Email Last Direction",
        "description": "Direction of the last tracked email event.",
        "groupName": "contactinformation",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
            {"label": "Outbound", "value": "outbound"},
            {"label": "Inbound", "value": "inbound"},
        ],
    },
]


def hs_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {HUBSPOT_TOKEN}",
        "Content-Type": "application/json",
    }


def property_exists(client: httpx.Client, object_type: str, prop_name: str) -> bool:
    url = f"{HUBSPOT_BASE_URL}/crm/v3/properties/{object_type}/{prop_name}"
    r = client.get(url, headers=hs_headers())
    if r.status_code == 200:
        return True
    if r.status_code == 404:
        return False
    r.raise_for_status()
    return False


def create_property(client: httpx.Client, object_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{HUBSPOT_BASE_URL}/crm/v3/properties/{object_type}"
    r = client.post(url, headers=hs_headers(), json=payload)
    # 409 sometimes happens if it already exists; treat as success-ish
    if r.status_code == 409:
        return {"name": payload["name"], "status": "exists"}
    r.raise_for_status()
    return r.json()


def main(object_type: str = "contacts") -> None:
    print(f"HubSpot base: {HUBSPOT_BASE_URL}")
    print(f"Creating properties on: {object_type}")

    with httpx.Client(timeout=30.0) as client:
        for p in PROPERTIES:
            name = p["name"]
            try:
                if property_exists(client, object_type, name):
                    print(f"✓ exists: {name}")
                    continue
                out = create_property(client, object_type, p)
                print(f"+ created: {out.get('name', name)}")
            except httpx.HTTPStatusError as e:
                body = e.response.text[:500] if e.response is not None else str(e)
                print(f"! failed: {name} -> {body}")
            except Exception as e:
                print(f"! failed: {name} -> {e}")

    print("Done.")


if __name__ == "__main__":
    main("contacts")
