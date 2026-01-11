import datetime
from typing import List, Optional
from app.models.schemas import CompanyInput, ContactCandidate, EnrichmentResult
from app.providers.apollo import ApolloProvider
from app.providers.clearbit import ClearbitProvider
from app.providers.hunter_verify import HunterVerifyProvider
from app.providers.zerobounce_verify import ZeroBounceProvider
from app.providers.neverbounce_verify import NeverBounceProvider
from app.pipeline.scoring import compute_role_fit, compute_overall_confidence

ENRICHERS = [ApolloProvider(), ClearbitProvider()]
VERIFIERS = [ZeroBounceProvider(), NeverBounceProvider(), HunterVerifyProvider()]

async def enrich_company(company: CompanyInput) -> EnrichmentResult:
    contacts: List[ContactCandidate] = []
    for p in ENRICHERS:
        try:
            contacts.extend(await p.find_contacts(company) or [])
        except Exception:
            continue

    seen = set()
    deduped: List[ContactCandidate] = []
    for c in contacts:
        key = (c.email or "").lower().strip() or (f"{c.full_name}|{c.title}".lower() if c.full_name or c.title else "")
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(c)

    for c in deduped:
        c.role_fit_score = compute_role_fit(c.title)

    for c in deduped:
        if not c.email:
            continue
        for v in VERIFIERS:
            try:
                res = await v.verify(c.email)
                if res != "unknown":
                    c.email_verification = res
                    break
            except Exception:
                continue

    for c in deduped:
        c.confidence = compute_overall_confidence(c)

    best: Optional[ContactCandidate] = None
    if deduped:
        best = sorted(deduped, key=lambda x: (x.confidence, x.role_fit_score), reverse=True)[0]

    notes = f"Enriched {len(deduped)} contacts at {datetime.datetime.utcnow().isoformat()}Z"
    return EnrichmentResult(company=company, contacts=deduped, best_contact=best, notes=notes)
