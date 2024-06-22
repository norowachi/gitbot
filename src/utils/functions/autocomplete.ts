import { Octokit } from "@octokit/rest";
import { getUser } from "@utils";
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
	const user = await getUser(octo, owner, isAuthed);
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
	// get user
	const user = await getUser(octo, owner, isAuthed);
	if (!user || !user.repos) return;
	const repoData = user.repos.find(
		(r) => r.name.toLowerCase() === repo.toLowerCase()
	);
	if (!repoData) return;

	// if no partial number, return all the pull numbers
	if (!partialNumber) return repoData.pulls.map((p) => `#${p}`).slice(0, 25);

	// filter pulls to get the ones that includes with the partial number
	const pulls = repoData.pulls
		.filter((p) => p.toString().includes(partialNumber))
		.map((p) => `#${p}`)
		.slice(0, 25);
	return pulls;
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
	// get user
	const user = await getUser(octo, owner, isAuthed);
	if (!user || !user.repos) return;
	const repoData = user.repos.find(
		(r) => r.name.toLowerCase() === repo.toLowerCase()
	);
	if (!repoData) return;

	// if no partial number, return all the issue numbers
	if (!partialNumber) return repoData.issues.map((i) => `#${i}`).slice(0, 25);

	// filter issues to get the ones that includes with the partial number
	const issues = repoData.issues
		.filter((i) => i.toString().includes(partialNumber))
		.map((i) => `#${i}`)
		.slice(0, 25);
	return issues;
}
