from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # HubSpot
    HUBSPOT_PRIVATE_APP_TOKEN: str | None = None
    HUBSPOT_BASE_URL: str = "https://api.hubapi.com"

    # Enrichment providers
    APOLLO_API_KEY: str | None = None
    CLEARBIT_API_KEY: str | None = None

    # Email verification
    NEVERBOUNCE_API_KEY: str | None = None
    ZEROBOUNCE_API_KEY: str | None = None
    HUNTER_API_KEY: str | None = None

    # Optional LLM (future extension)
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4.1-mini"

    # Email tracking
    EMAIL_TRACKING_SECRET: str | None = None
    EMAIL_EVENT_LOG_PATH: str = "data/email_events.jsonl"

    # Runtime
    APP_ENV: str = "dev"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8099

    HTTP_TIMEOUT_S: int = 30
    MAX_RETRIES: int = 3

settings = Settings()
