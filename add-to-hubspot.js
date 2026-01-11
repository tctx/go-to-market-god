// --- JAVASCRIPT TEMPLATE FOR CHATGPT TO FILL ---
// NOTE: For safety, DO NOT hardcode tokens in chat/code. Set it at runtime instead.
// Option A (recommended): in DevTools Console run: sessionStorage.setItem("HUBSPOT_TOKEN","<your token>")
// Option B: you will be prompted when you run this script.

(async () => {
    // CRITICAL: do NOT hardcode secrets in code you share.
    const HUBSPOT_TOKEN =
      sessionStorage.getItem("HUBSPOT_TOKEN") ||
      localStorage.getItem("HUBSPOT_TOKEN") ||
      (typeof prompt === "function" ? prompt("Paste your HubSpot Private App token") : "");
  
    if (!HUBSPOT_TOKEN) throw new Error("Missing HUBSPOT_TOKEN. Set sessionStorage HUBSPOT_TOKEN or paste when prompted.");
  
    // --- helpers ---
    const hsFetch = async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          ...(options.headers || {}),
        },
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {}
      if (!res.ok) {
        throw new Error(`HubSpot API error ${res.status} ${res.statusText}: ${text?.slice(0, 800)}`);
      }
      return json;
    };
  
    const safePick = (obj, allowedKeysSet) => {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (allowedKeysSet.has(k) && v !== undefined && v !== null && v !== "") out[k] = v;
      }
      return out;
    };

    // Drop enum values that aren't allowed by the portal to avoid 400s.
    const sanitizeProperties = (input, propDefs = new Map()) => {
      const out = {};
      for (const [key, value] of Object.entries(input || {})) {
        if (value === undefined || value === null || value === "") continue;
        const def = propDefs.get(key);
        if (!def) continue;
        const optionSet = new Set((def.options || []).map((o) => o.value).filter(Boolean));
        if (optionSet.size) {
          if (Array.isArray(value)) {
            const filtered = value.filter((v) => optionSet.has(v));
            if (!filtered.length) {
              console.warn(`Skipping ${key} — no allowed options left from array.`);
              continue;
            }
            out[key] = filtered.join(";");
            continue;
          }
          // Handle semicolon-delimited multi-select strings
          if (typeof value === "string" && value.includes(";")) {
            const filtered = value
              .split(";")
              .map((v) => v.trim())
              .filter((v) => v && optionSet.has(v));
            if (!filtered.length) {
              console.warn(`Skipping ${key} — no allowed options left after filtering.`);
              continue;
            }
            out[key] = filtered.join(";");
            continue;
          }
          if (!optionSet.has(value)) {
            console.warn(`Skipping ${key} — "${value}" not in allowed options.`);
            continue;
          }
        }
        out[key] = value;
      }
      return out;
    };
  
    // For multi-select checkbox properties in HubSpot: usually semicolon-separated values.
    const joinMulti = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).join(";") : "");
  
    // Find contact by email (for upserting existing contacts)
    const findContactByEmail = async (email) => {
      if (!email) return null;
      const search = await hsFetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [{ propertyName: "email", operator: "EQ", value: email }],
            },
          ],
          properties: ["email", "firstname", "lastname"],
          limit: 1,
        }),
      });
      return (search?.results || [])[0] || null;
    };
  
    // Find contact by name (firstname + lastname) - for discovering existing contacts
    const findContactByName = async (firstname, lastname) => {
      if (!firstname || !lastname) return null;
      const search = await hsFetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "firstname", operator: "EQ", value: firstname },
                { propertyName: "lastname", operator: "EQ", value: lastname },
              ],
            },
          ],
          properties: ["email", "firstname", "lastname", "company"],
          limit: 1,
        }),
      });
      return (search?.results || [])[0] || null;
    };
  
    // Find company by name - for discovering existing companies
    const findCompanyByName = async (companyName) => {
      if (!companyName) return null;
      const search = await hsFetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: companyName }] }],
          properties: ["name", "domain"],
          limit: 1,
        }),
      });
      return (search?.results || [])[0] || null;
    };
  
    // Find company by domain - more robust search to prevent duplicates
    const findCompanyByDomain = async (domain) => {
      if (!domain) return null;
      const search = await hsFetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: domain }] }],
          properties: ["name", "domain"],
          limit: 1,
        }),
      });
      return (search?.results || [])[0] || null;
    };
  
    // Robust company finder - checks by name AND domain to prevent duplicates
    const findCompanyRobust = async (companyName, domain) => {
      if (companyName) {
        const byName = await findCompanyByName(companyName);
        if (byName?.id) return byName;
      }
      if (domain) {
        const byDomain = await findCompanyByDomain(domain);
        if (byDomain?.id) return byDomain;
      }
      return null;
    };
  
    // Associate contact to company
    const associateContactToCompany = async (contactId, companyId) => {
      try {
        await hsFetch(`https://api.hubapi.com/crm/v3/associations/contacts/companies/batch/create`, {
          method: "POST",
          body: JSON.stringify({
            inputs: [{ from: { id: contactId }, to: { id: companyId }, type: "contact_to_company" }],
          }),
        });
        return true;
      } catch (e) {
        console.warn(`⚠️ Failed to associate contact ${contactId} to company ${companyId}:`, e?.message || e);
        return false;
      }
    };
  
    // 1. SET THE ID AND TYPE (from your active HubSpot URL)
    // https://app.hubspot.com/contacts/45592037/record/0-2/47330573227?... -> ID is 47330573227, type 0-2 = companies
    const objectId = "47330573227";
    const objectType = "companies";
  
    // 2. DATA TO UPDATE (company enrichment)
    // NOTE: property filtering below prevents errors if a property name doesn't exist in your portal.
    const propertiesToUpdate = {
      name: "Active Capital",
      domain: "active.vc",
      website: "https://active.vc/",
      city: "San Antonio",
      state: "TX",
      // HubSpot "industry" enums vary by portal; we provide a likely value and rely on filtering if it doesn't exist.
      industry: "CAPITAL_MARKETS",
      // Short description (left-side Description)
      description:
        "Active Capital is a venture firm focused on pre-seed investing in the future of enterprise software, backing ambitious technical founders solving real business problems with software and AI. Typical check size $100K–$1M; prefers being meaningful first capital. Contact: team@active.vc.",
      // Longer "About Us" (custom field in your portal)
      about_us:
        "Active Capital (San Antonio, TX) is a founder-led venture firm investing primarily at pre-seed (and sometimes seed) in enterprise software and cloud infrastructure, including AI-powered business software. They emphasize being meaningful early capital, writing initial checks typically in the $100K–$1M range, and supporting founders hands-on (operator-style) — particularly in underdog cities across the U.S. Their team includes Pat Matthews (Founder & CEO), Cat Dizon (Co-Founder & Partner), Chris Saum (Investment Partner), Avery Keller (Executive Admin), and Kevin Minnick (Technical Advisor).",
      // Optional social fields if they exist in your company schema
      twitterhandle: "activecapitalvc",
      hs_linkedin_url: "https://www.linkedin.com/company/activecapital/",
      // Your custom score field
      investment_confidence: 88,
      // If your portal uses custom min/max fields (as seen on the record), we try to populate them:
      check_min: "100000",
      check_max: "1000000",
      // Optional categorization fields (may be custom)
      type: "VC",
      firm_lead_status: "TARGET",
    };
  
    // 3. EXECUTE UPDATE (with property filtering to avoid errors)
    console.log(`Fetching ${objectType} property definitions to safely update ${objectId}...`);
    const propsMeta = await hsFetch(`https://api.hubapi.com/crm/v3/properties/${objectType}?archived=false`);
    const propDefs = new Map((propsMeta?.results || []).map((p) => [p.name, p]));
    const allowedProps = new Set(propDefs.keys());
    const properties = sanitizeProperties(safePick(propertiesToUpdate, allowedProps), propDefs);

    console.log(`Updating ${objectType} ${objectId} with properties:`, Object.keys(properties));
    const updated = await hsFetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/${objectId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
    console.log("Update Success:", updated?.id || updated);
  
    // 4. ADD ANALYST NOTE (Research logic)
    const noteBody = `
      <strong>Analyst Research (Active Capital) — Fit & GTM</strong><br><br>
  
      <strong>Who they are</strong><br>
      Active Capital is a San Antonio-based venture firm focused on pre-seed investing in enterprise software & cloud infrastructure, including AI-powered business software. They typically invest early and prefer to be meaningful first capital, with typical checks roughly $100K–$1M. Their public founder guidance emphasizes staying small/scrappy until real PMF and being financially disciplined/customer-obsessed.<br><br>
  
      <strong>Why Synthetic Friends fits</strong><br>
      Synthetic Friends is “AI-powered business software” that replaces broken apps/menus/chatbots with a native messaging storefront. That maps to their stated thesis (enterprise software, cloud/AI, real business problems) and their preference for technical founders building practical software. While you position through restaurants/hospitality, the underlying wedge is enterprise workflow + transaction orchestration (CRM/POS/payments/memory) delivered through messaging — very legible B2B SaaS with an AI interface layer.<br><br>
  
      <strong>Most likely decision-maker / champion</strong><br>
      <ul>
        <li><strong>Pat Matthews (Founder & CEO)</strong> — primary IC; operator-turned-investor (SaaS/cloud background). Most likely to lead if he believes you can become the “front-of-house OS” for SMBs and expand into a broader agentic storefront platform.</li>
        <li><strong>Cat Dizon (Co-Founder & Partner)</strong> — strong network/operator background; key for warm intros, ecosystem leverage (TX/startup community).</li>
        <li><strong>Chris Saum (Investment Partner)</strong> — invests in pre-seed/seed B2B SaaS; could be a fast path to a first meeting and internal advocacy.</li>
      </ul>
  
      <strong>Exact GTM motion to convince them (what to do + what to say)</strong><br>
      <ol>
        <li><strong>Lead with a 60-second “operator demo”</strong>: “Text this number. Order a coffee. Watch the AI do upsell + memory + payment handoff.” Make it feel like Rackspace-era “software that actually works” — reliable, fast, and human.</li>
        <li><strong>Frame the wedge as enterprise workflow, not ‘chatbot’</strong>: “We’re not automating support. We’re replacing the storefront interface with a transaction-capable agent that plugs into POS/Stripe/CRM.”</li>
        <li><strong>Show the ‘first capital’ narrative they like</strong>: scrappy pilots, founder-led sales, high-touch onboarding, disciplined burn. “We can get to repeatable pilots with 20–30 SMBs before scaling.”</li>
        <li><strong>Use their underdog-city bias</strong>: “We’re building the new interface for local commerce everywhere — not just SF. Messaging is the distribution; we’re making it default.”</li>
        <li><strong>Concrete ask</strong>: pre-seed lead/co-lead (or meaningful first-check) + intros to their B2B SaaS / infra founder network for early pilot customers.</li>
      </ol>
  
      <strong>Personalized hooks / connection angles</strong><br>
      <ul>
        <li><strong>Pat Matthews</strong>: SaaS/cloud operator story → your “reliability moat” (iMessage bridge + orchestration). Emphasize “fanatical support for SMBs” vibe and real revenue outcomes.</li>
        <li><strong>Cat Dizon</strong>: TX ecosystem + community building. Position Synthetic Friends as an unlock for local businesses; ask for intros to SA/Austin operator networks.</li>
        <li><strong>Chris Saum</strong>: direct angle: “AI-powered business software” at pre-seed; show pilot traction + conversion/upsell metrics plan.</li>
      </ul>
  
      <strong>Warm intro targets (adjacent)</strong><br>
      They highlight deep ties to Rackspace alumni; advisors include Graham Weston and Pat Condon (Rackspace co-founders). If you have any mutuals in the Rackspace/SA ecosystem, that’s your best ‘fast lane.’<br><br>
  
      <strong>Confidence score</strong><br>
      88/100 — Strong thesis match (pre-seed + enterprise software + AI) and appropriate check size/behavior. Key risk is whether they view “restaurants/hospitality” as too consumer-y; mitigate by leading with the B2B systems/integration + revenue engine framing.<br>
    `;
  
    console.log("Creating analyst note...");
    const noteCreate = await hsFetch("https://api.hubapi.com/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: Date.now(),
          hs_note_body: noteBody,
        },
      }),
    });
    const noteId = noteCreate?.id;
    console.log("Note Added:", noteId);
  
    if (noteId) {
      console.log("Associating note to " + objectType + "...");
      const associationType = "note_to_company";
      await hsFetch(`https://api.hubapi.com/crm/v3/associations/notes/${objectType}/batch/create`, {
        method: "POST",
        body: JSON.stringify({
          inputs: [{ from: { id: noteId }, to: { id: objectId }, type: associationType }],
        }),
      });
      console.log("Note associated to " + objectType);
    }
  
    // 4.5. TEAM MEMBER DISCOVERY (bi-directional enrichment)
    // Extracted from the HubSpot associations list + firm website team page.
    const otherTeamMembers = [
      {
        firstname: "Pat",
        lastname: "Matthews",
        jobtitle: "Founder & CEO",
        company: "Active Capital",
        city: "San Antonio",
        state: "TX",
        investor_type: "VC",
        helps_with: joinMulti(["Strategy", "Go To Market", "Connections"]),
        why_targeted:
          "Founder & CEO; operator-turned-investor with deep SaaS/cloud background; Active Capital leads/co-leads pre-seed in enterprise software/AI.",
        best_topic_to_connect_on:
          "Show a live iMessage ordering demo + explain the reliability moat (iMessage bridge + orchestration) and why messaging becomes the default commerce interface.",
        notes:
          "Active Capital thesis: pre-seed enterprise software & cloud infrastructure, including AI-powered business software; prefers meaningful first capital and disciplined founders.",
        twitterhandle: "patmatthews",
        hs_linkedin_url: "https://www.linkedin.com/in/pat-matthews",
      },
      {
        firstname: "Cat",
        lastname: "Dizon",
        jobtitle: "Co-Founder & Partner",
        company: "Active Capital",
        city: "San Antonio",
        state: "TX",
        investor_type: "VC",
        helps_with: joinMulti(["Connections", "Go To Market", "Strategy"]),
        why_targeted:
          "Key partner/operator; strong TX ecosystem ties; likely helpful for warm intros and positioning in SA/Austin networks.",
        best_topic_to_connect_on:
          "Local SMB adoption + founder-led onboarding playbook; leveraging TX operator networks for pilots.",
        notes:
          "Background includes leadership in the San Antonio startup/angel ecosystem; strong community/network leverage.",
        twitterhandle: "CatDizonTx",
        hs_linkedin_url: "https://www.linkedin.com/in/cat-dizon-43ab858",
      },
      {
        firstname: "Chris",
        lastname: "Saum",
        jobtitle: "Investment Partner",
        company: "Active Capital",
        city: "Austin",
        state: "TX",
        investor_type: "VC",
        helps_with: joinMulti(["Strategy", "Go To Market", "Connections"]),
        why_targeted:
          "Investment Partner focused on pre-seed/seed B2B SaaS; likely to engage quickly if the product is concrete and ships.",
        best_topic_to_connect_on:
          "AI-powered business software wedge: transaction-capable agent replacing the storefront (not a chatbot) + early pilots + metrics plan.",
        notes:
          "Pre-seed/seed investor; prior founder/operator background; active on X discussing investing in AI-powered business software.",
        twitterhandle: "christophersaum",
        hs_linkedin_url: "https://www.linkedin.com/in/chris-saum-84938047",
      },
      {
        firstname: "Avery",
        lastname: "Keller",
        jobtitle: "Executive Admin",
        company: "Active Capital",
        city: "San Antonio",
        state: "TX",
        investor_type: "VC",
        helps_with: joinMulti(["Connections"]),
        why_targeted:
          "Exec admin is often the fastest path to scheduling; useful for routing a crisp intro + deck + demo link.",
        best_topic_to_connect_on:
          "Scheduling a short live demo; sending a clean one-pager + deck + ‘text-to-try’ link.",
        notes:
          "Handles coordination/scheduling for the firm; leverage for quick meeting setup.",
        hs_linkedin_url: "https://www.linkedin.com/in/averykellermeyer",
      },
      {
        firstname: "Kevin",
        lastname: "Minnick",
        jobtitle: "Technical Advisor",
        company: "Active Capital",
        investor_type: "VC",
        helps_with: joinMulti(["Engineering", "Product", "Strategy"]),
        why_targeted:
          "Technical advisor; relevant to iMessage-bridge reliability + product engineering discussions.",
        best_topic_to_connect_on:
          "Systems reliability + product architecture for real-world messaging commerce; how to make it bulletproof.",
        notes:
          "Product/technical operator; recently joined as Technical Advisor at Active Capital.",
        hs_linkedin_url: "https://www.linkedin.com/in/kevinminnick",
      },
    ];
  
    if (otherTeamMembers.length > 0) {
      console.log(`Searching for and adding ${otherTeamMembers.length} team member(s)...`);
      const contactPropMeta = await hsFetch(`https://api.hubapi.com/crm/v3/properties/contacts?archived=false`);
      const contactPropDefs = new Map((contactPropMeta?.results || []).map((p) => [p.name, p]));
      const allowedContactProps = new Set(contactPropDefs.keys());

      for (const member of otherTeamMembers) {
        let existing = null;
        if (member.email) existing = await findContactByEmail(member.email);
        if (!existing && member.firstname && member.lastname) {
          existing = await findContactByName(member.firstname, member.lastname);
        }
  
        const contactProps = safePick(
          {
            email: member.email,
            phone: member.phone,
            firstname: member.firstname,
            lastname: member.lastname,
            jobtitle: member.jobtitle,
            company: member.company,
            city: member.city,
            state: member.state,
            website: member.website,
            investor_type: member.investor_type,
            helps_with: member.helps_with,
            why_targeted: member.why_targeted,
            best_topic_to_connect_on: member.best_topic_to_connect_on,
            notes: member.notes,
            twitterhandle: member.twitterhandle,
            hs_linkedin_url: member.hs_linkedin_url,
          },
          allowedContactProps
        );
        const sanitizedContactProps = sanitizeProperties(contactProps, contactPropDefs);

        let contactId;
        if (existing?.id) {
          console.log(`Updating existing contact ${existing.id}: ${member.firstname} ${member.lastname}`);
          await hsFetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: sanitizedContactProps }),
          });
          contactId = existing.id;
        } else {
          if (member.firstname && member.lastname) {
            console.log(`Creating new contact: ${member.firstname} ${member.lastname}`);
            const created = await hsFetch("https://api.hubapi.com/crm/v3/objects/contacts", {
              method: "POST",
              body: JSON.stringify({ properties: sanitizedContactProps }),
            });
            contactId = created?.id;
          } else {
            console.warn(`⚠️ Skipping team member - insufficient info: ${JSON.stringify(member)}`);
            continue;
          }
        }
  
        // Link to this company
        if (contactId) {
          await associateContactToCompany(contactId, objectId);
          console.log(`✅ Linked ${member.firstname} ${member.lastname} to company "Active Capital"`);
        }
      }
      console.log("Team member enrichment complete.");
    }
  })();
  
