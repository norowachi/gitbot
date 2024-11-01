import { json, Router } from "express";
import { encryptToken, env, rest, Errors, ghLinks, DateInISO } from "@utils";
import { DeleteUser, InitUser } from "@database/functions/user.js";
import { APIUser, Routes } from "discord-api-types/v10";
import { Octokit } from "@octokit/rest";
import axios from "axios";
import { inspect } from "node:util";

// setting up a router
const github = Router();

// first route users gets sent to for redirection
github.get("/verify/:random", (req, res) => {
	const random = req.params.random;
	if (!random || !ghLinks.has(random)) return res.sendStatus(400);

	return res.redirect(
		`https://github.com/apps/${env.GITHUB_CLIENT_NAME}/installations/new?state=${random}`
	);
});

// oauth & getting access token here
github.get("/callback", async (req, res) => {
	const state = req.query.state as string;
	// check if the state is valid
	if (!state || !ghLinks.has(state)) return res.sendStatus(400);

	// get the code
	const code = req.query.code as string;

	const result = await verifyUser(code, ghLinks.get(state));

	if (typeof result === "number") return res.sendStatus(result);
	else if (typeof result === "string") return res.send(result);

	// redirect to the guide page with success message
	return res.redirect(`https://norowa.dev/gitbot/guide?success`);
});

// the webhooks route
//TODO: use the webhook to manage uh stuff?
github.post("/webhook", json(), (req, res) => {
	const body = req.body;
	console.log(
		DateInISO(),
		"[WEBHOOK]",
		body.issue ? "issue" : body.pull_request ? "pull_request" : "unknown",
		body.action
	);
	if (
		(body.action === "revoked" && body.sender.id) ||
		(body.action === "deleted" && body.installation.target_id)
	) {
		DeleteUser({ githubId: body.sender.id });
	}

	res.sendStatus(200);
});

export default github;

async function verifyUser(code: string, discordId: string) {
	if (!code || !discordId) return 400;

	// get the access token
	const result = await (
		await axios({
			url: `https://github.com/login/oauth/access_token?client_id=${env.GITHUB_CLIENT_ID}&client_secret=${env.GITHUB_CLIENT_SECRET}&code=${code}`,
			headers: {
				Accept: "application/vnd.github+json",
			},
			method: "POST",
		}).catch(() => {})
	)?.data;

	if (!result) return Errors.Unexpected;
	// check if the access token is valid
	if (!result.access_token) return 400;

	// initialize octokit
	const octokit = new Octokit({
		auth: result.access_token,
	});

	// get the discord user data
	const discord_user = (await rest.req(
		"GET",
		Routes.user(discordId)
	)) as APIUser;
	// get the github user data
	const github_user = (await octokit.users.getAuthenticated()).data;

	// check if the returned user data is valid
	if (!discord_user || !github_user || !discord_user.id || !github_user.id)
		return 400;

	// initialize the user
	const InitUserResult = await InitUser({
		discord: {
			id: discord_user.id,
		},
		github: {
			id: github_user.id.toString(),
			login: github_user.login,
			type: github_user.type,
			access_token: encryptToken(result.access_token),
		},
	});

	return InitUserResult;
}
