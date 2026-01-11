const crypto = require("crypto");

const stubJob = (type) => ({
  id: crypto.randomUUID(),
  type,
  status: "queued",
  message: "Pipeline queue not wired yet.",
});

const enqueueCompanySearch = async () => stubJob("company_search");
const enqueueEnrichment = async () => stubJob("enrichment");
const enqueueOutreach = async () => stubJob("outreach");
const enqueueDraft = async () => stubJob("draft_emails");
const enqueueSend = async () => stubJob("send_emails");

module.exports = {
  enqueueCompanySearch,
  enqueueEnrichment,
  enqueueOutreach,
  enqueueDraft,
  enqueueSend,
};
