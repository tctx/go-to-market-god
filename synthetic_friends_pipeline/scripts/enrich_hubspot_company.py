import asyncio, sys, json
import httpx

async def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/enrich_hubspot_company.py <hubspot_company_id> [base_url]")
        raise SystemExit(1)
    company_id = sys.argv[1]
    base_url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8099"
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{base_url}/pipeline/enrich_hubspot_company", json={"hubspot_company_id": company_id})
        r.raise_for_status()
        print(json.dumps(r.json(), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
