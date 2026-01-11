"""
Central place to map your HubSpot property names.

If you already have custom properties, update these strings
to match your portal schema.
"""

COMPANY_PROPS = {
    # pipeline bookkeeping
    "sf_last_enriched_at": "sf_last_enriched_at",
    "sf_enrichment_status": "sf_enrichment_status",  # queued/running/success/error
    "sf_enrichment_notes": "sf_enrichment_notes",
    "sf_best_contact_email": "sf_best_contact_email",
    "sf_best_contact_name": "sf_best_contact_name",
    "sf_best_contact_role": "sf_best_contact_role",
    "sf_best_contact_score": "sf_best_contact_score",
}

CONTACT_PROPS = {
    "sf_role_fit_score": "sf_role_fit_score",
    "sf_email_verification": "sf_email_verification",  # deliverable/undeliverable/risky/unknown
    "sf_confidence": "sf_confidence",  # 0-100
    "sf_source": "sf_source",  # apollo/clearbit/manual
    # email tracking rollups
    "sf_email_first_tracked_at": "sf_email_first_tracked_at",
    "sf_email_last_activity_at": "sf_email_last_activity_at",
    "sf_email_last_sent_at": "sf_email_last_sent_at",
    "sf_email_last_received_at": "sf_email_last_received_at",
    "sf_email_last_opened_at": "sf_email_last_opened_at",
    "sf_email_last_clicked_at": "sf_email_last_clicked_at",
    "sf_email_sent_count": "sf_email_sent_count",
    "sf_email_received_count": "sf_email_received_count",
    "sf_email_open_count": "sf_email_open_count",
    "sf_email_click_count": "sf_email_click_count",
    "sf_email_last_subject": "sf_email_last_subject",
    "sf_email_last_thread_id": "sf_email_last_thread_id",
    "sf_email_last_message_id": "sf_email_last_message_id",
    "sf_email_last_event_type": "sf_email_last_event_type",
    "sf_email_last_direction": "sf_email_last_direction",
}
