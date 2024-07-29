import { env, DiscordRestClient } from "@utils";
import { APIApplicationCommand, Routes } from "discord-api-types/v10";
import { inspect } from "node:util";
import { readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

const rest = new DiscordRestClient(env.DISCORD_APP_TOKEN!);
const commands: Omit<APIApplicationCommand, "application_id" | "id">[] = [];

async function register() {
	console.log("Started refreshing application (/) commands.");
	await getInteractionCommands(commands);
	await rest
		.req("PUT", Routes.applicationCommands(rest.me.id), { body: commands })
		.then((res: any) => {
			res.errors
				? console.error(inspect(res.errors, { depth: Infinity }))
				: console.log(res);
		});
}

register();

/**
 * returns all the commands in the commands folder
 * @param commands array to output commands into
 * @param dir where the commands at
 */
export async function getInteractionCommands(
	commands: any[],
	dir = "./commands"
) {
	try {
		const filePath = join(import.meta.dirname, dir);
		const files = readdirSync(filePath);
		for (const file of files) {
			const stat = lstatSync(join(filePath, file));
			if (stat.isDirectory()) {
				await getInteractionCommands(commands, join(dir, file));
			}
			if (file.startsWith("mod")) {
				let { default: Command } = await import(
					join(import.meta.url, "..", dir, file)
				);
				commands.push({
					default_member_permission: Command.default_member_permission,
					type: Command.type,
					name: Command.name,
					name_localizations: Command.name_localizations,
					description: Command.description,
					description_localizations: Command.description_localizations,
					dm_permissions: Command.dm_permissions,
					options: Command.options,
					contexts: Command.contexts,
					integration_types: Command.integration_types,
					nsfw: Command.nsfw,
				});
			}
		}
	} catch (e) {
		console.error(e);
	}
}
