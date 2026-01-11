# Synthetic Friends Pipeline (HubSpot Enricher + Verifier)

A **production-lean** FastAPI service that:
- Ingests a **HubSpot Company** (by companyId) or manual company input
- Finds likely decision-makers (via providers like Apollo/Clearbit — pluggable)
- Verifies emails (provider-agnostic; supports common vendors)
- Scores + ranks contacts for outreach
- Writes everything back to **HubSpot** (company + contacts + associations + properties)
- Can be triggered by:
  - a HubSpot button/extension calling a webhook, or
  - a CLI run, or
  - an API call from anywhere

---

## Quickstart (local)

1) Create `.env` from `.env.example`

2) Run:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8099
```

3) Health:

```bash
curl http://localhost:8099/health
```

4) Trigger (manual company):

```bash
curl -X POST http://localhost:8099/pipeline/enrich_company \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Example Restaurants","domain":"example.com","hq_city":"Dallas","hq_state":"TX"}'
```

5) Trigger (HubSpot companyId):

```bash
curl -X POST http://localhost:8099/pipeline/enrich_hubspot_company \
  -H "Content-Type: application/json" \
  -d '{"hubspot_company_id":"123456789"}'
```

---

## HubSpot extension / button (concept)

Call:

`POST /webhook/hubspot/company`

with payload containing `companyId`.

The service will:
- Read company properties from HubSpot
- Run enrichment + email verification
- Create/update contacts
- Associate contacts to company
- Write pipeline status properties back to the company record

---

## Email tracking (Gmail extension + pixel)

The pipeline also accepts email events and serves a tracking pixel:

- `POST /email/event` (body = event payload; optional `X-SF-Tracking-Token`)
- `GET /email/pixel.gif?tid=...&e=...` (open tracking)
- `GET /email/redirect?tid=...&url=...&e=...` (click tracking)

Events are appended to `data/email_events.jsonl` (configurable via `EMAIL_EVENT_LOG_PATH`) and rolled up into HubSpot contact properties.

---

## Keys you need

- `HUBSPOT_PRIVATE_APP_TOKEN`
- At least one enrichment provider:
  - `APOLLO_API_KEY`
  - `CLEARBIT_API_KEY`
- At least one email verifier:
  - `ZEROBOUNCE_API_KEY` or `NEVERBOUNCE_API_KEY` or `HUNTER_API_KEY`

---

## Notes
- Adapters include **safe placeholders** where vendor APIs differ by plan.
- Update endpoints in `app/providers/*` to match your subscriptions.
