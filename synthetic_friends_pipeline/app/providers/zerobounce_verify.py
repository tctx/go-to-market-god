from app.config.settings import settings
from app.providers.base import EmailVerificationProvider
from app.utils.http import make_client, retryable

class ZeroBounceProvider(EmailVerificationProvider):
    name = "zerobounce"

    async def verify(self, email: str) -> str:
        if not settings.ZEROBOUNCE_API_KEY:
            return "unknown"
        params = {"api_key": settings.ZEROBOUNCE_API_KEY, "email": email}
        async with make_client() as client:
            @retryable()
            async def do():
                resp = await client.get("https://api.zerobounce.net/v2/validate", params=params)
                resp.raise_for_status()
                return resp.json()
            data = await do()
        status = (data.get("status") or "unknown").lower()
        if status in ("valid", "catch-all"):
            return "deliverable" if status == "valid" else "risky"
        if status in ("invalid", "spamtrap", "abuse"):
            return "undeliverable"
        return "unknown"
