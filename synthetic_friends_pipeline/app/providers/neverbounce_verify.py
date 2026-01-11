import orjson
from app.config.settings import settings
from app.providers.base import EmailVerificationProvider
from app.utils.http import make_client, retryable

class NeverBounceProvider(EmailVerificationProvider):
    name = "neverbounce"

    async def verify(self, email: str) -> str:
        if not settings.NEVERBOUNCE_API_KEY:
            return "unknown"
        headers = {"Authorization": f"Bearer {settings.NEVERBOUNCE_API_KEY}", "Content-Type": "application/json"}
        payload = {"email": email}
        async with make_client(headers=headers) as client:
            @retryable()
            async def do():
                resp = await client.post("https://api.neverbounce.com/v4/single/check", content=orjson.dumps(payload))
                if resp.status_code == 404:
                    return {"result": "unknown"}
                resp.raise_for_status()
                return resp.json()
            data = await do()
        result = (data.get("result") or "unknown").lower()
        if result in ("valid",):
            return "deliverable"
        if result in ("catchall", "catch_all"):
            return "risky"
        if result in ("invalid",):
            return "undeliverable"
        return "unknown"
