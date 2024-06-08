import {
	DBUserDoc,
	UserEnums,
	DBUserOptions,
	DBUser,
} from "../../interfaces/database/user";
import user from "../schemas/user";

// initialize a user document
export async function InitUser(
	options: DBUserOptions<"init">
): Promise<UserEnums> {
	// check if the github account is already linked to a discord account
	// and return an error string if the github account is already linked to a discord account
	if ((await FindUser({ githubId: options.github.id }))?.discord.id)
		return UserEnums.GithubLinked;
	// check if the discord account is already linked to a github account
	// and return an error string if the discord account is already linked to a github account
	if ((await FindUser({ discordId: options.discord.id }))?.github.id)
		return UserEnums.DiscordLinked;

	// create a new user document
	await user
		.create({
			discord: {
				id: options.discord.id,
				username: options.discord.username,
			},
			github: {
				id: options.github.id,
				username: options.github.username,
				name: options.github.name,
				location: options.github.location,
				bio: options.github.bio,
				twitter: options.github.twitter,
				followers: options.github.followers,
				following: options.github.following,
				created_at: options.github.created_at,
				access_token: options.github.access_token,
			},
		} as DBUser)
		.catch(() => {
			return UserEnums.Error;
		}); // catch any errors
	return UserEnums.Success;
}

// get a user document by discord or github id
export async function FindUser({
	discordId,
	githubId,
}: {
	discordId?: string;
	githubId?: string;
}) {
	return await user.findOne<DBUserDoc>({
		$or: [{ "discord.id": discordId }, { "github.id": githubId }],
	});
}
