import orjson
from typing import List
from app.config.settings import settings
from app.models.schemas import CompanyInput, ContactCandidate
from app.providers.base import EnrichmentProvider
from app.utils.http import make_client, retryable

class ApolloProvider(EnrichmentProvider):
    name = "apollo"

    async def find_contacts(self, company: CompanyInput) -> List[ContactCandidate]:
        if not settings.APOLLO_API_KEY:
            return []
        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": settings.APOLLO_API_KEY,
        }
        payload = {
            "q_organization_domains": company.domain or "",
            "page": 1,
            "person_titles": [
                "Chief Technology Officer",
                "VP Digital",
                "VP Marketing",
                "VP Ecommerce",
                "Head of Digital",
                "Head of Ecommerce",
                "Innovation",
                "Product",
                "Operations",
            ],
            "per_page": 10,
        }

        async with make_client(headers=headers) as client:
            @retryable()
            async def do():
                # Placeholder endpoint; Apollo endpoint availability varies by plan.
                resp = await client.post("https://api.apollo.io/v1/mixed_people/search", content=orjson.dumps(payload))
                if resp.status_code == 404:
                    return {"people": []}
                resp.raise_for_status()
                return resp.json()
            data = await do()

        people = data.get("people") or data.get("contacts") or []
        out: List[ContactCandidate] = []
        for p in people[:10]:
            full_name = " ".join([x for x in [p.get("first_name"), p.get("last_name")] if x]) or p.get("name")
            out.append(ContactCandidate(
                first_name=p.get("first_name"),
                last_name=p.get("last_name"),
                full_name=full_name,
                title=p.get("title"),
                email=p.get("email"),
                phone=(p.get("phone_numbers", [{}])[0].get("raw_number") if isinstance(p.get("phone_numbers"), list) else None),
                linkedin_url=p.get("linkedin_url"),
                source=self.name,
                confidence=60 if p.get("email") else 40,
            ))
        return out
