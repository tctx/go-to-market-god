import datetime
from app.hubspot.client import HubSpotClient
from app.config.hubspot_properties import COMPANY_PROPS, CONTACT_PROPS
from app.models.schemas import EnrichmentResult

def _iso_now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

async def write_result_to_hubspot(company_id: str, result: EnrichmentResult):
    hs = HubSpotClient()

    best = result.best_contact
    company_props = {
        COMPANY_PROPS["sf_last_enriched_at"]: _iso_now(),
        COMPANY_PROPS["sf_enrichment_status"]: "success",
        COMPANY_PROPS["sf_enrichment_notes"]: (result.notes or "")[:2500],
    }
    if best:
        company_props.update({
            COMPANY_PROPS["sf_best_contact_email"]: best.email or "",
            COMPANY_PROPS["sf_best_contact_name"]: best.full_name or "",
            COMPANY_PROPS["sf_best_contact_role"]: best.title or "",
            COMPANY_PROPS["sf_best_contact_score"]: str(best.confidence),
        })
    await hs.update_company(company_id, company_props)

    for c in result.contacts:
        if not c.email:
            continue
        contact_props = {
            "firstname": (c.first_name or (c.full_name.split(" ")[0] if c.full_name else ""))[:50],
            "lastname": (c.last_name or (" ".join(c.full_name.split(" ")[1:]) if c.full_name and len(c.full_name.split(" ")) > 1 else ""))[:50],
            "jobtitle": (c.title or "")[:255],
            CONTACT_PROPS["sf_role_fit_score"]: str(c.role_fit_score),
            CONTACT_PROPS["sf_email_verification"]: c.email_verification,
            CONTACT_PROPS["sf_confidence"]: str(c.confidence),
            CONTACT_PROPS["sf_source"]: c.source,
        }
        obj = await hs.create_or_update_contact_by_email(c.email, contact_props)
        contact_id = (obj or {}).get("id")
        if contact_id:
            await hs.associate_contact_to_company(contact_id, company_id)
