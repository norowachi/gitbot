import {
	DBUserDoc,
	UserEnums,
	DBUserOptions,
	DBUser,
} from "@database/interfaces/user.js";
import { Errors } from "@utils";
import user from "@database/schemas/user.js";

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
			},
			github: {
				id: options.github.id,
				login: options.github.login,
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
			return Errors.Unexpected;
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

// Delete a user document by discord id
export async function DeleteUser(discordId: string) {
	return await user.deleteOne({ "discord.id": discordId });
}
