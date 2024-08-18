import { Octokit } from "@octokit/rest";
import { getLevelUser, getLevelUserName } from "@utils";
import { APIApplicationCommandOptionChoice } from "discord-api-types/v10";
import Fuse from "fuse.js";

/**
 * handle repo autocomplete
 * returns the repos that includes the partial repo name, sorted linear then fuzzy
 */
export async function handleRepoAutocomplete(
	octo: Octokit,
	owner: string,
	isAuthed: boolean = false,
	partialRepo?: string
) {
	// get user
	const user = await getLevelUser(octo, owner, isAuthed);
	if (!user || !user.repos) return;
	// get the repos' name in an array
	const repos = [...new Set(user.repos.map((repo) => repo.name))];

	// return all the repos if no partial repo
	// TODO: make this sort by most used repos, or popular idk
	if (!partialRepo) return repos.slice(0, 25);

	// fuzzy search the repos
	const search = new Fuse(repos, {
		includeScore: true,
		// sort by score
		sortFn: (a, b) => a.score - b.score,
	}).search(partialRepo);
	// return the items

	return search.map((r) => r.item).slice(0, 25);
}

/**
 * handle pull number autocomplete
 * returns the pull numbers that includes the partial number, sorted
 */
export async function handlePullNumberAutocomplete(
	octo: Octokit,
	owner: string,
	repo: string,
	isAuthed: boolean = false,
	partialNumber?: string
) {
	let pulls: undefined | number[] = undefined;
	// get user
	const user = await getLevelUser(octo, owner, isAuthed);
	if (!user || !user.repos) return;
	const repoData = user.repos.find(
		(r) => r.name.toLowerCase() === repo.toLowerCase()
	);
	if (!repoData)
		pulls = (
			await octo.pulls.list({ owner, repo }).catch((_) => {})
		)?.data.map((p) => p.number);
	else pulls = repoData.pulls;

	// if no partial number, return all the pull numbers
	if (!partialNumber) return pulls?.slice(0, 25) || [];

	// filter pulls to get the ones that includes with the partial number
	return (
		pulls
			?.filter((p) => p.toString().includes(partialNumber))
			.slice(0, 25) || []
	);
}

/**
 * handle issue number autocomplete
 * returns the issue numbers that includes the partial number, sorted
 */
export async function handleIssueNumberAutocomplete(
	octo: Octokit,
	owner: string,
	repo: string,
	isAuthed: boolean = false,
	partialNumber?: string
) {
	let issues: undefined | number[] = undefined;
	// get user
	const user = await getLevelUser(octo, owner, isAuthed);
	if (!user || !user.repos) return;
	const repoData = user.repos.find(
		(r) => r.name.toLowerCase() === repo.toLowerCase()
	);
	if (!repoData)
		issues = (
			await octo.issues.listForRepo({ owner, repo }).catch((_) => {})
		)?.data.map((i) => i.number);
	else issues = repoData.issues;

	// if no partial number, return all the issue numbers
	if (!partialNumber) return issues?.slice(0, 25) || [];

	// filter issues to get the ones that includes with the partial number
	return (
		issues
			?.filter((i) => i.toString().includes(partialNumber))
			.slice(0, 25) || []
	);
}

/**
 * handle label autocomplete
 */
export async function handleLabelAutocomplete(
	octo: Octokit,
	owner: string,
	repo: string,
	isAuthed: boolean = false,
	partialLabel?: string
) {
	// get user
	const user = await getLevelUser(octo, owner, isAuthed);
	if (!user || !user.repos) return;
	const repoData = user.repos.find(
		(r) => r.name.toLowerCase() === repo.toLowerCase()
	);

	// separating the labels
	const curval = [...new Set(partialLabel?.split(/,\s*/g))].map((v) =>
		v.trim().toLowerCase()
	);

	// fn to join the labels' names and values
	const joinLabels = (c: APIApplicationCommandOptionChoice[]) =>
		c
			.map((c) => ({ ...c, value: String(c.value).trim().toLowerCase() }))
			.filter(
				(v) =>
					!curval.at(-1)?.includes(String(v.value)) ||
					curval.at(-1) === v.value
			)
			.map((v) => ({
				name: (curval.slice(0, -1).join(", ") + ", " + v.name).replace(
					/^,\s*/gm,
					""
				),
				value: (
					curval.slice(0, -1).join(", ") +
					", " +
					v.value
				).replace(/^,\s*/gm, ""),
			}))
			.filter(
				(v) =>
					v.value === [...new Set(v.value.split(/,\s*/g))].join(", ")
			);

	if (!repoData) {
		const data = (
			await octo.issues
				.listLabelsForRepo({ owner, repo })
				.catch((_) => {})
		)?.data.map((l) => ({
			name: l.name,
			value: l.name,
		}));

		if (data) return joinLabels(data).slice(0, 25);
		else return;
	}

	return joinLabels(
		repoData.labels.map((l) => ({ name: l, value: l }))
	).slice(0, 25);
}

/**
 * handle user autocomplete
 * which includes owner, assignees, reviewers, etc.
 */
export async function handleUserAutocomplete(
	login: string,
	partialUser?: string
) {
	const users = [...new Set([...(await getLevelUserName()), login])];

	if (!partialUser) return users.slice(0, 25);

	// fuzzy search the users
	const search = new Fuse(users, {
		includeScore: true,
		// sort by score
		sortFn: (a, b) => a.score - b.score,
	}).search(partialUser);

	return search.map((r) => r.item).slice(0, 25);
}
