import { Octokit } from "@octokit/rest";
import { Level } from "level";
import { getGHUserRepos, LevelUser } from "@utils";

// Create or open a LevelDB database
const db = new Level<string, LevelUser>("./leveldb", { valueEncoding: "json" });

export async function upsertLevelUser(
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
export async function getLevelUser(
	octo: Octokit,
	login: string,
	isAuthed: boolean = false
): Promise<LevelUser | undefined> {
	try {
		const user = await db.get(login);
		if (!user)
			return await upsertLevelUser(octo, isAuthed ? undefined : login);
		return user;
	} catch (e) {
		return await upsertLevelUser(octo, isAuthed ? undefined : login);
	}
}

// get all users (db keys)
export async function getLevelUserName() {
	return await db.keys().all();
}
