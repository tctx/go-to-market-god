from app.config.settings import settings
from app.providers.base import EmailVerificationProvider
from app.utils.http import make_client, retryable

class HunterVerifyProvider(EmailVerificationProvider):
    name = "hunter"

    async def verify(self, email: str) -> str:
        if not settings.HUNTER_API_KEY:
            return "unknown"
        params = {"email": email, "api_key": settings.HUNTER_API_KEY}
        async with make_client() as client:
            @retryable()
            async def do():
                resp = await client.get("https://api.hunter.io/v2/email-verifier", params=params)
                resp.raise_for_status()
                return resp.json()
            data = await do()
        result = (((data or {}).get("data") or {}).get("result") or "unknown").lower()
        if result in ("deliverable", "undeliverable", "risky"):
            return result
        return "unknown"
