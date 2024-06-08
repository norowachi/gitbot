export interface GithubUser {
	/* username of the user */
	login: string;
	/* id of the user */
	id: number;
	/* node_id of the user */
	node_id: string;
	/* avatar url of the user
	 * "https://avatars.githubusercontent.com/u/{id}"
	 */
	avatar_url: string;
	/* gravatar id of the user */
	gravatar_id: string;
	/* url of the user
	 * "https://api.github.com/users/{login}"
	 */
	url: string;
	/* html url of the user
	 * "https://github.com/{login}"
	 */
	html_url: string;
	/* followers url of the user
	 * "https://api.github.com/users/{login}/followers"
	 */
	followers_url: string;
	/* following url of the user
	 * "https://api.github.com/users/{login}/following{/other_user}"
	 */
	following_url: string;
	/* gists url of the user
	 * "https://api.github.com/users/{login}/gists{/gist_id}"
	 */
	gists_url: string;
	/* starred url of the user
	 * "https://api.github.com/users/{login}/starred{/owner}{/repo}"
	 */
	starred_url: string;
	/* subscriptions url of the user
	 * "https://api.github.com/users/{login}/subscriptions"
	 */
	subscriptions_url: string;
	/* organizations url of the user
	 * "https://api.github.com/users/{login}/orgs"
	 */
	organizations_url: string;
	/* repos url of the user
	 * "https://api.github.com/users/{login}/repos"
	 */
	repos_url: string;
	/* events url of the user
	 * "https://api.github.com/users/{login}/events{/privacy}"
	 */
	events_url: string;
	/* received events url of the user
	 * "https://api.github.com/users/{login}/received_events"
	 */
	received_events_url: string;
	/* type of the user account */
	type: string;
	/* site admin status */
	site_admin: boolean;
	/* name */
	name: string;
	/* company */
	company: string;
	/* blog */
	blog: string;
	/* location */
	location: string;
	/* email */
	email: string;
	/* hireable status
        idk its type
    */
	hireable: any;
	/* bio */
	bio: string;
	/* twitter username */
	twitter_username: string;
	/* number of public repos */
	public_repos: number;
	/* number of the public gists */
	public_gists: number;
	/* number of followers */
	followers: number;
	/* number of followings */
	following: number;
	/* created at date */
	created_at: string;
	/* user account updated */
	updated_at: string;
}
