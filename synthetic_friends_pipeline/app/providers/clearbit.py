from typing import List
from app.config.settings import settings
from app.models.schemas import CompanyInput, ContactCandidate
from app.providers.base import EnrichmentProvider
from app.utils.http import make_client, retryable

class ClearbitProvider(EnrichmentProvider):
    name = "clearbit"

    async def find_contacts(self, company: CompanyInput) -> List[ContactCandidate]:
        if not settings.CLEARBIT_API_KEY or not company.domain:
            return []
        headers = {"Authorization": f"Bearer {settings.CLEARBIT_API_KEY}"}
        async with make_client(headers=headers) as client:
            @retryable()
            async def do():
                # Placeholder: company endpoint (doesn't return people).
                resp = await client.get("https://company.clearbit.com/v2/companies/find", params={"domain": company.domain})
                if resp.status_code in (404, 422):
                    return None
                resp.raise_for_status()
                return resp.json()
            _ = await do()
        return []
