import re
from app.models.schemas import ContactCandidate

ROLE_KEYWORDS = [
    ("ecommerce", 30),
    ("digital", 25),
    ("growth", 18),
    ("marketing", 16),
    ("product", 15),
    ("innovation", 15),
    ("technology", 12),
    ("cto", 25),
    ("cio", 25),
    ("operations", 10),
    ("customer", 10),
    ("loyalty", 10),
]

SENIORITY_BONUS = [
    (r"\bchief\b", 20),
    (r"\bvp\b", 15),
    (r"\bhead\b", 12),
    (r"\bdirector\b", 10),
    (r"\bfounder\b", 10),
    (r"\bowner\b", 8),
]

def compute_role_fit(title: str | None) -> int:
    if not title:
        return 0
    t = title.lower()
    score = 0
    for kw, pts in ROLE_KEYWORDS:
        if kw in t:
            score += pts
    for pat, pts in SENIORITY_BONUS:
        if re.search(pat, t):
            score += pts
    return max(0, min(100, score))

def compute_overall_confidence(c: ContactCandidate) -> int:
    score = 0
    if c.email:
        score += 35
    if c.linkedin_url:
        score += 15
    if c.title:
        score += 15
    score += int(c.role_fit_score * 0.35)
    if c.email_verification == "deliverable":
        score += 20
    elif c.email_verification == "risky":
        score += 8
    return max(0, min(100, score))
