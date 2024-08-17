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
): Promise<string | DBUserDoc> {
	// check if the github account is already linked to a discord account
	// and return an error string if the github account is already linked to a discord account
	if ((await getUser({ githubId: options.github.id }))?.discord.id)
		return UserEnums.GithubLinked;
	// check if the discord account is already linked to a github account
	// and return an error string if the discord account is already linked to a github account
	if ((await getUser({ discordId: options.discord.id }))?.github.id)
		return UserEnums.DiscordLinked;

	// create a new user document
	const DBUser = await user
		.create({
			discord: {
				id: options.discord.id,
			},
			github: {
				id: options.github.id,
				login: options.github.login,
				type: options.github.type,
				access_token: options.github.access_token,
			},
		} as DBUser)
		// catch any errors
		.catch((e) => {
			console.log(e);
		});

	if (!DBUser) return Errors.Unexpected;
	return DBUser;
}

// get a user document by discord or github id
export async function getUser({
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
export async function DeleteUser({
	discordId,
	githubId,
}: {
	discordId?: string;
	githubId?: string;
}) {
	return await user.findOneAndDelete({
		$or: [{ "discord.id": discordId }, { "github.id": githubId }],
	});
}

export async function editUserSettings(
	discordId: string,
	settings: Partial<DBUser["settings"]>
) {
	const user = await getUser({ discordId });
	if (!user) return;
	// key is either "issues" or "misc"
	Object.entries(settings).forEach(([key, values]) => {
		// if value is an array and {user.settings} has it, push new values to the existing values
		if (key === "issues" && Array.isArray(values)) {
			values.map((value) => {
				const old = user.settings[key].find(
					(i) => i.owner === value.owner && i.repo === value.repo
				);
				if (old) Object.assign(old, value);
				else user.settings[key].push(value);
			});
		}
		// else update the misc values
		else if (key === "misc") Object.assign(user.settings.misc, values);
	});

	// update the user document
	await user.save().catch((_) => {});
	return;
}
