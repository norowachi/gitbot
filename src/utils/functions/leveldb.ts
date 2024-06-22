import { Octokit } from "@octokit/rest";
import { Level } from "level";
import { LevelRepo, LevelUser } from "@utils";
import { Endpoints } from "@octokit/types";

// Create or open a LevelDB database
const db = new Level<string, LevelUser>("./leveldb", { valueEncoding: "json" });

export async function upsertUser(
	octo: Octokit,
	login?: string
): Promise<LevelUser | undefined> {
	// get gh user data
	const response = await (login
		? octo.users.getByUsername({
				username: login,
		  })
		: octo.users.getAuthenticated()
	).catch((_) => {});

	// if error
	if (!response) return;

	const data = {
		login: response.data.login,
		repos: await getGHUserRepos(octo, login),
		last_updated: Date.now(),
	};
	await db.put(response.data.login, data);
	// return data
	return data;
}

/**
 * get a User
 * @param octo the octokit obj
 * @param login  the username
 * @param isAuthed if that user is the authed user
 * @returns
 */
export async function getUser(
	octo: Octokit,
	login: string,
	isAuthed: boolean = false
): Promise<LevelUser | undefined> {
	try {
		const user = await db.get(login);
		if (!user) return await upsertUser(octo, isAuthed ? undefined : login);
		// update on interaction, every hour
		// if last updated is more than an hour ago
		if (user.last_updated + 1000 * 60 * 60 * 1 < Date.now()) {
			return await upsertUser(octo, isAuthed ? undefined : login);
		}
		return user;
	} catch (e) {
		return await upsertUser(octo, isAuthed ? undefined : login);
	}
}

/**
 * get a User's Repos
 * @param octo the octokit object
 * @param login username, if empty will get auth'd users'
 * @returns
 */
export async function getGHUserRepos(octo: Octokit, login?: string) {
	// get gh data
	// if login exists get that user's repos and save em
	// if it doesnt get auth'd user's
	const response = await (login
		? octo.repos.listForUser({ username: login })
		: octo.repos.listForAuthenticatedUser()
	).catch((_) => {});

	if (!response) return;
	// loop thru repos to return levelrepo schema

	const UserRepos = await Promise.all(
		response.data.map(async (d, i) => {
			// get repo's pulls
			const pulls = await getPulls(octo, d as any);
			// get repo's issues
			const issues = await getIssues(octo, d as any);
			// set LevelRepo obj
			return {
				name: d.name,
				pulls: pulls ? pulls.data.map((p) => p.number) : [],
				issues: issues ? issues.data.map((i) => i.number) : [],
			} as LevelRepo;
		})
	);

	// finally return the repos with filtered dubs
	return UserRepos;
}

// get issues
const getIssues = async (
	octo: Octokit,
	d: Endpoints["GET /repos/{owner}/{repo}"]["response"]["data"]
) =>
	await octo.issues
		.list({
			owner: d.owner.login,
			repo: d.name,
			state: "all",
			per_page: 50,
		})
		.catch((_) => {});

// get PRs
const getPulls = async (
	octo: Octokit,
	d: Endpoints["GET /repos/{owner}/{repo}"]["response"]["data"]
) =>
	await octo.pulls
		.list({
			owner: d.owner.login,
			repo: d.name,
			state: "all",
			per_page: 50,
		})
		.catch((_) => {});
