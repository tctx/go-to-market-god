import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config.settings import settings

def make_client(headers: dict | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=settings.HTTP_TIMEOUT_S,
        headers=headers or {},
        follow_redirects=True,
    )

def retryable():
    return retry(
        stop=stop_after_attempt(settings.MAX_RETRIES),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=6),
        reraise=True,
    )
