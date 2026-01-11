import orjson
from app.config.settings import settings
from app.utils.http import make_client, retryable

class HubSpotClient:
    def __init__(self):
        if not settings.HUBSPOT_PRIVATE_APP_TOKEN:
            raise ValueError("HUBSPOT_PRIVATE_APP_TOKEN is not set")
        self.base_url = settings.HUBSPOT_BASE_URL.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {settings.HUBSPOT_PRIVATE_APP_TOKEN}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, json_body=None, params=None):
        url = f"{self.base_url}{path}"
        async with make_client(headers=self.headers) as client:

            @retryable()
            async def do():
                resp = await client.request(
                    method, url,
                    content=orjson.dumps(json_body) if json_body is not None else None,
                    params=params
                )
                resp.raise_for_status()
                return resp.json() if resp.content else None

            return await do()

    async def get_company(self, company_id: str, properties: list[str] | None = None):
        params = {}
        if properties:
            params["properties"] = properties
        return await self._request("GET", f"/crm/v3/objects/companies/{company_id}", params=params)

    async def search_contact_by_email(self, email: str, properties: list[str] | None = None):
        body = {
            "filterGroups": [{"filters": [{"propertyName": "email", "operator": "EQ", "value": email}]}],
            "limit": 1,
        }
        if properties:
            body["properties"] = properties
        search = await self._request("POST", "/crm/v3/objects/contacts/search", json_body=body)
        results = (search or {}).get("results", [])
        return results[0] if results else None

    async def create_or_update_contact_by_email(self, email: str, properties: dict):
        contact = await self.search_contact_by_email(email)
        if contact:
            contact_id = contact["id"]
            return await self._request("PATCH", f"/crm/v3/objects/contacts/{contact_id}", json_body={"properties": properties})
        return await self._request("POST", "/crm/v3/objects/contacts", json_body={"properties": {"email": email, **properties}})

    async def create_contact(self, properties: dict):
        return await self._request("POST", "/crm/v3/objects/contacts", json_body={"properties": properties})

    async def update_contact(self, contact_id: str, properties: dict):
        return await self._request("PATCH", f"/crm/v3/objects/contacts/{contact_id}", json_body={"properties": properties})

    async def update_company(self, company_id: str, properties: dict):
        return await self._request("PATCH", f"/crm/v3/objects/companies/{company_id}", json_body={"properties": properties})

    async def associate_contact_to_company(self, contact_id: str, company_id: str):
        return await self._request(
            "PUT",
            f"/crm/v4/objects/contacts/{contact_id}/associations/companies/{company_id}/contact_to_company",
        )
