const fastify = require("fastify")({ logger: true });
const bcrypt = require("bcryptjs");
const { prisma } = require("./db");
const { env, hubspotScopes, googleScopes, port, baseUrl } = require("./env");
const { encryptString, decryptString, hashState, randomState } = require("./crypto");
const pipeline = require("./pipeline");

fastify.register(require("@fastify/jwt"), { secret: env.JWT_SECRET });

fastify.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (error) {
    return reply.code(401).send({ ok: false, error: "Unauthorized" });
  }
});

const integrationTypeFromParam = (value) => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "hubspot") return "HUBSPOT";
  if (normalized === "gmail") return "GMAIL";
  return null;
};

const buildSuccessRedirect = (payload) => {
  if (!env.APP_SUCCESS_REDIRECT) return null;
  try {
    const url = new URL(env.APP_SUCCESS_REDIRECT);
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  } catch (_) {
    return null;
  }
};

fastify.get("/health", async () => ({ ok: true }));

fastify.post("/v1/auth/register", async (request, reply) => {
  const { email, password, orgName } = request.body || {};
  if (!email || !password || !orgName) {
    return reply.code(400).send({ ok: false, error: "Missing email, password, or orgName" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return reply.code(409).send({ ok: false, error: "User already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      memberships: {
        create: {
          role: "owner",
          organization: { create: { name: orgName } },
        },
      },
    },
    include: {
      memberships: { include: { organization: true } },
    },
  });

  const membership = user.memberships[0];
  const token = fastify.jwt.sign({ userId: user.id, orgId: membership.organization.id });
  return reply.send({
    ok: true,
    token,
    user: { id: user.id, email: user.email },
    org: { id: membership.organization.id, name: membership.organization.name },
  });
});

fastify.post("/v1/auth/login", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    return reply.code(400).send({ ok: false, error: "Missing email or password" });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { organization: true } } },
  });
  if (!user) {
    return reply.code(401).send({ ok: false, error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return reply.code(401).send({ ok: false, error: "Invalid credentials" });
  }

  const membership = user.memberships[0];
  const token = fastify.jwt.sign({ userId: user.id, orgId: membership.organization.id });
  return reply.send({
    ok: true,
    token,
    user: { id: user.id, email: user.email },
    orgs: user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
    })),
  });
});

fastify.get("/v1/me", { preHandler: [fastify.authenticate] }, async (request) => {
  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    include: { memberships: { include: { organization: true } } },
  });
  if (!user) return { ok: false, error: "User not found" };
  return {
    ok: true,
    user: { id: user.id, email: user.email },
    orgs: user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
    })),
  };
});

fastify.get("/v1/integrations", { preHandler: [fastify.authenticate] }, async (request) => {
  const integrations = await prisma.integration.findMany({
    where: { orgId: request.user.orgId },
    include: { token: true },
  });
  return {
    ok: true,
    integrations: integrations.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      hasRefreshToken: Boolean(item.token && item.token.refreshTokenEnc),
      expiresAt: item.token ? item.token.expiresAt : null,
    })),
  };
});

fastify.post(
  "/v1/integrations/:type/oauth/start",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const type = integrationTypeFromParam(request.params.type);
    if (!type) {
      return reply.code(400).send({ ok: false, error: "Unsupported integration type" });
    }

    if (type === "HUBSPOT" && (!env.HUBSPOT_CLIENT_ID || !env.HUBSPOT_CLIENT_SECRET || !env.HUBSPOT_REDIRECT_URI)) {
      return reply.code(400).send({ ok: false, error: "HubSpot OAuth not configured" });
    }
    if (type === "GMAIL" && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI)) {
      return reply.code(400).send({ ok: false, error: "Google OAuth not configured" });
    }

    const state = randomState();
    const redirectUri = type === "HUBSPOT" ? env.HUBSPOT_REDIRECT_URI : env.GOOGLE_REDIRECT_URI;

    await prisma.oAuthState.create({
      data: {
        orgId: request.user.orgId,
        type,
        stateHash: hashState(state),
        redirectUri,
      },
    });

    let authUrl;
    if (type === "HUBSPOT") {
      const url = new URL("https://app.hubspot.com/oauth/authorize");
      url.searchParams.set("client_id", env.HUBSPOT_CLIENT_ID);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", hubspotScopes.join(" "));
      url.searchParams.set("state", state);
      authUrl = url.toString();
    } else {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("scope", googleScopes.join(" "));
      url.searchParams.set("state", state);
      authUrl = url.toString();
    }

    return reply.send({ ok: true, url: authUrl, redirectUri, baseUrl });
  }
);

fastify.get("/v1/integrations/:type/oauth/callback", async (request, reply) => {
  const type = integrationTypeFromParam(request.params.type);
  if (!type) return reply.code(400).send({ ok: false, error: "Unsupported integration type" });

  const { code, state, error, error_description: errorDescription } = request.query || {};
  if (error) {
    const redirect = buildSuccessRedirect({ status: "error", type, error });
    if (redirect) return reply.redirect(redirect);
    return reply.code(400).send({ ok: false, error, detail: errorDescription });
  }
  if (!code || !state) {
    return reply.code(400).send({ ok: false, error: "Missing code or state" });
  }

  const stateHash = hashState(state);
  const stored = await prisma.oAuthState.findFirst({ where: { stateHash, type } });
  if (!stored) {
    return reply.code(400).send({ ok: false, error: "Invalid state" });
  }

  await prisma.oAuthState.delete({ where: { id: stored.id } });
  const redirectUri = stored.redirectUri;

  let tokenPayload;
  if (type === "HUBSPOT") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.HUBSPOT_CLIENT_ID,
      client_secret: env.HUBSPOT_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    });
    const resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    tokenPayload = await resp.json();
    if (!resp.ok) {
      const redirect = buildSuccessRedirect({ status: "error", type, error: "token_exchange_failed" });
      if (redirect) return reply.redirect(redirect);
      return reply.code(400).send({ ok: false, error: tokenPayload });
    }
  } else {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    });
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    tokenPayload = await resp.json();
    if (!resp.ok) {
      const redirect = buildSuccessRedirect({ status: "error", type, error: "token_exchange_failed" });
      if (redirect) return reply.redirect(redirect);
      return reply.code(400).send({ ok: false, error: tokenPayload });
    }
  }

  const expiresAt = tokenPayload.expires_in
    ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000)
    : null;

  const integration = await prisma.integration.upsert({
    where: { orgId_type: { orgId: stored.orgId, type } },
    update: { status: "connected" },
    create: { orgId: stored.orgId, type, status: "connected" },
  });

  await prisma.integrationToken.upsert({
    where: { integrationId: integration.id },
    update: {
      accessTokenEnc: encryptString(tokenPayload.access_token || ""),
      refreshTokenEnc: tokenPayload.refresh_token
        ? encryptString(tokenPayload.refresh_token)
        : undefined,
      tokenType: tokenPayload.token_type || null,
      scope: tokenPayload.scope || null,
      expiresAt,
    },
    create: {
      integrationId: integration.id,
      accessTokenEnc: encryptString(tokenPayload.access_token || ""),
      refreshTokenEnc: tokenPayload.refresh_token
        ? encryptString(tokenPayload.refresh_token)
        : null,
      tokenType: tokenPayload.token_type || null,
      scope: tokenPayload.scope || null,
      expiresAt,
    },
  });

  const redirect = buildSuccessRedirect({ status: "ok", type });
  if (redirect) return reply.redirect(redirect);
  return reply.send({ ok: true, type, status: "connected" });
});

fastify.post(
  "/v1/integrations/:type/oauth/refresh",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const type = integrationTypeFromParam(request.params.type);
    if (!type) return reply.code(400).send({ ok: false, error: "Unsupported integration type" });

    const integration = await prisma.integration.findUnique({
      where: { orgId_type: { orgId: request.user.orgId, type } },
      include: { token: true },
    });
    if (!integration || !integration.token) {
      return reply.code(404).send({ ok: false, error: "Integration not connected" });
    }

    const refreshToken = integration.token.refreshTokenEnc
      ? decryptString(integration.token.refreshTokenEnc)
      : "";
    if (!refreshToken) {
      return reply.code(400).send({ ok: false, error: "Missing refresh token" });
    }

    let tokenPayload;
    if (type === "HUBSPOT") {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.HUBSPOT_CLIENT_ID,
        client_secret: env.HUBSPOT_CLIENT_SECRET,
        refresh_token: refreshToken,
      });
      const resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      tokenPayload = await resp.json();
      if (!resp.ok) {
        return reply.code(400).send({ ok: false, error: tokenPayload });
      }
    } else {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
      });
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      tokenPayload = await resp.json();
      if (!resp.ok) {
        return reply.code(400).send({ ok: false, error: tokenPayload });
      }
    }

    const expiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000)
      : null;

    await prisma.integrationToken.update({
      where: { integrationId: integration.id },
      data: {
        accessTokenEnc: encryptString(tokenPayload.access_token || ""),
        refreshTokenEnc: tokenPayload.refresh_token
          ? encryptString(tokenPayload.refresh_token)
          : integration.token.refreshTokenEnc,
        tokenType: tokenPayload.token_type || integration.token.tokenType,
        scope: tokenPayload.scope || integration.token.scope,
        expiresAt,
      },
    });

    return reply.send({ ok: true, status: "refreshed" });
  }
);

fastify.post(
  "/v1/pipeline/targets/search",
  { preHandler: [fastify.authenticate] },
  async () => {
    const job = await pipeline.enqueueCompanySearch();
    return { ok: true, job };
  }
);

fastify.post(
  "/v1/pipeline/targets/import",
  { preHandler: [fastify.authenticate] },
  async () => {
    const job = await pipeline.enqueueCompanySearch();
    return { ok: true, job };
  }
);

fastify.post(
  "/v1/pipeline/enrich",
  { preHandler: [fastify.authenticate] },
  async () => {
    const job = await pipeline.enqueueEnrichment();
    return { ok: true, job };
  }
);

fastify.post(
  "/v1/pipeline/outreach/draft",
  { preHandler: [fastify.authenticate] },
  async () => {
    const job = await pipeline.enqueueDraft();
    return { ok: true, job };
  }
);

fastify.post(
  "/v1/pipeline/outreach/send",
  { preHandler: [fastify.authenticate] },
  async () => {
    const job = await pipeline.enqueueSend();
    return { ok: true, job };
  }
);

const start = async () => {
  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    fastify.log.info(`SaaS backend running at ${baseUrl}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
