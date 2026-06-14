import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import axios from "axios";
import { env, encryptToken, ghLinks, log } from "@utils";
import { InitUser, getUser } from "@database/functions/user.js";
import { UserEnums } from "@database/interfaces/user.js";

const router = Router();

/**
 * Rate-limit OAuth callbacks: max 10 exchanges per IP per 15 minutes.
 * This prevents token-exchange abuse even if an attacker harvests valid state tokens.
 */
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many link attempts. Please wait a moment and try again.",
});

/** GET /github/verify/:state — redirect target from GitHub OAuth flow */
router.get("/verify/:state", oauthLimiter, async (req, res) => {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    res.status(503).send("GitHub OAuth is not configured on this instance.");
    return;
  }
  const state = req.params.state as string;

  if (!state || !ghLinks.has(state))
    return res.status(400).send("Invalid or expired state token. Please run `/link` again.");

  return res.redirect(
    `https://github.com/apps/${env.GITHUB_CLIENT_NAME}/installations/new?state=${state}`
  );
});

router.get("/callback", async (req, res) => {
  const state = req.query.state as string;
  const code = req.query.code;

  const discordId = ghLinks.get(state);
  if (!discordId) {
    res.status(400).send("Invalid or expired state token. Please run `/link` again.");
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).send("Missing OAuth code.");
    return;
  }

  // Exchange code for access token
  const tokenRes = await axios
    .post<{ access_token?: string; error?: string }>(
      "https://github.com/login/oauth/access_token",
      {
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${env.SITE_URL}/github/callback`,
      },
      { headers: { Accept: "application/vnd.github+json" } }
    )
    .catch(() => null);

  if (!tokenRes?.data?.access_token) {
    log.error({ body: tokenRes?.data }, "[OAuth] Failed to obtain access token");
    res.status(500).send("Failed to obtain GitHub access token. Please try again.");
    return;
  }

  const accessToken = tokenRes.data.access_token;

  // Fetch GitHub user info
  const userRes = await axios
    .get<{
      id: number;
      login: string;
      type: string;
    }>("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "gitbot/2.0" },
    })
    .catch(() => null);

  if (!userRes?.data) {
    res.status(500).send("Failed to fetch GitHub user. Please try again.");
    return;
  }

  const gh = userRes.data;
  ghLinks.delete(state);

  const existing = await getUser({ discordId });
  const isRotation = existing !== null;

  const result = await InitUser({
    discord: { id: discordId },
    github: {
      id: gh.id.toString(),
      login: gh.login,
      type: gh.type,
      access_token: encryptToken(accessToken),
    },
  });

  if (typeof result === "string" && result !== UserEnums.Success) {
    res.status(409).send(result);
    return;
  }

  log.info(
    { github: gh.login, discord: discordId, rotation: isRotation },
    isRotation ? "[OAuth] Token rotated" : "[OAuth] Account linked"
  );

  res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">` +
      (isRotation
        ? `<h2>✅ Token rotated for <strong>${gh.login}</strong>!</h2>`
        : `<h2>✅ Linked <strong>${gh.login}</strong> to Gitbot!</h2>`) +
      `<p>You can close this tab and return to Discord.</p>` +
      `</body></html>`
  );
});

export default router;
