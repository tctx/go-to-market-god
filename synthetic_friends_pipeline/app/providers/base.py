from abc import ABC, abstractmethod
from typing import List
from app.models.schemas import CompanyInput, ContactCandidate

class EnrichmentProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def find_contacts(self, company: CompanyInput) -> List[ContactCandidate]:
        raise NotImplementedError

class EmailVerificationProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def verify(self, email: str) -> str:
        """Return: deliverable | undeliverable | risky | unknown"""
        raise NotImplementedError
