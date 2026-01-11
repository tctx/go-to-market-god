import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, RedirectResponse
from app.models.schemas import CompanyInput, HubSpotCompanyRef, EnrichmentResult, EmailEvent
from app.utils.log import get_logger
from app.hubspot.client import HubSpotClient
from app.pipeline.orchestrator import enrich_company
from app.pipeline.hubspot_writer import write_result_to_hubspot
from app.pipeline.email_tracking import handle_email_event, PIXEL_GIF_BYTES
from app.config.hubspot_properties import COMPANY_PROPS
from app.config.settings import settings

logger = get_logger("sf-pipeline")

app = FastAPI(title="Synthetic Friends Pipeline", version="0.1.0")

@app.get("/health")
def health():
    return {"ok": True}

def _verify_tracking_token(request: Request) -> None:
    if not settings.EMAIL_TRACKING_SECRET:
        return
    token = request.headers.get("X-SF-Tracking-Token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if token != settings.EMAIL_TRACKING_SECRET:
        raise HTTPException(status_code=401, detail="Invalid tracking token")

@app.post("/email/event")
async def email_event_endpoint(event: EmailEvent, request: Request):
    _verify_tracking_token(request)
    request_meta = {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("User-Agent"),
    }
    result = await handle_email_event(event, request_meta=request_meta)
    return result

@app.get("/email/pixel.gif")
async def email_pixel_endpoint(request: Request, tid: str, e: str | None = None):
    event = EmailEvent(
        event_type="open",
        direction="outbound",
        tid=tid,
        contact_email=e,
        to_emails=[e] if e else [],
        occurred_at=datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        metadata={"source": "pixel"},
    )
    request_meta = {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("User-Agent"),
    }
    await handle_email_event(event, request_meta=request_meta)
    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
    }
    return Response(content=PIXEL_GIF_BYTES, media_type="image/gif", headers=headers)

@app.get("/email/redirect")
async def email_redirect_endpoint(request: Request, tid: str, url: str, e: str | None = None):
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid redirect URL")
    event = EmailEvent(
        event_type="click",
        direction="outbound",
        tid=tid,
        contact_email=e,
        to_emails=[e] if e else [],
        occurred_at=datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        metadata={"source": "redirect", "url": url},
    )
    request_meta = {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("User-Agent"),
    }
    await handle_email_event(event, request_meta=request_meta)
    return RedirectResponse(url=url)

@app.post("/pipeline/enrich_company", response_model=EnrichmentResult)
async def enrich_company_endpoint(company: CompanyInput):
    return await enrich_company(company)

@app.post("/pipeline/enrich_hubspot_company", response_model=EnrichmentResult)
async def enrich_hubspot_company(ref: HubSpotCompanyRef):
    hs = HubSpotClient()
    props = ["name", "domain", "city", "state"] + list(COMPANY_PROPS.values())
    company_obj = await hs.get_company(ref.hubspot_company_id, properties=props)
    if not company_obj:
        raise HTTPException(status_code=404, detail="HubSpot company not found")

    p = (company_obj.get("properties") or {})
    company = CompanyInput(
        company_name=p.get("name") or f"Company {ref.hubspot_company_id}",
        domain=p.get("domain") or None,
        hq_city=p.get("city") or None,
        hq_state=p.get("state") or None,
        notes=f"HubSpot companyId={ref.hubspot_company_id}",
    )

    # mark running (best-effort)
    try:
        await hs.update_company(ref.hubspot_company_id, {
            COMPANY_PROPS["sf_enrichment_status"]: "running",
            COMPANY_PROPS["sf_enrichment_notes"]: "Pipeline started",
        })
    except Exception:
        pass

    try:
        result = await enrich_company(company)
    except Exception as e:
        try:
            await hs.update_company(ref.hubspot_company_id, {
                COMPANY_PROPS["sf_enrichment_status"]: "error",
                COMPANY_PROPS["sf_enrichment_notes"]: f"Pipeline failed: {str(e)[:500]}",
            })
        except Exception:
            pass
        raise

    await write_result_to_hubspot(ref.hubspot_company_id, result)
    return result

@app.post("/webhook/hubspot/company")
async def hubspot_company_webhook(payload: dict):
    company_id = payload.get("companyId") or payload.get("company_id") or payload.get("hubspot_company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Missing companyId in payload")
    result = await enrich_hubspot_company(HubSpotCompanyRef(hubspot_company_id=str(company_id)))
    return {"ok": True, "companyId": str(company_id), "best": result.best_contact.model_dump() if result.best_contact else None}
