from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal

class CompanyInput(BaseModel):
    company_name: str = Field(..., description="Company or restaurant group name")
    domain: Optional[str] = Field(None, description="Primary domain, if known")
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    notes: Optional[str] = None

class HubSpotCompanyRef(BaseModel):
    hubspot_company_id: str

class ContactCandidate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    source: str = "unknown"
    confidence: int = 0
    role_fit_score: int = 0
    email_verification: str = "unknown"  # deliverable/undeliverable/risky/unknown

class EnrichmentResult(BaseModel):
    company: CompanyInput
    contacts: List[ContactCandidate] = []
    best_contact: Optional[ContactCandidate] = None
    notes: Optional[str] = None

class EmailEvent(BaseModel):
    event_type: Literal["sent", "received", "open", "click"]
    direction: Optional[Literal["outbound", "inbound"]] = None
    tid: str
    contact_email: Optional[str] = None
    from_email: Optional[str] = None
    to_emails: List[str] = Field(default_factory=list)
    cc_emails: List[str] = Field(default_factory=list)
    bcc_emails: List[str] = Field(default_factory=list)
    subject: Optional[str] = None
    message_id: Optional[str] = None
    thread_id: Optional[str] = None
    gmail_message_id: Optional[str] = None
    gmail_thread_id: Optional[str] = None
    user_email: Optional[str] = None
    occurred_at: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
