import RestClient from "./rest.js";
import { env, getInteractionCommands } from "./utils.js";
import { APIApplicationCommand, Routes } from "discord-api-types/v10";
import { inspect } from "node:util";

const rest = new RestClient(env.DISCORD_APP_TOKEN!);
const application_id = env.DISCORD_APP_ID!;
const commands: Omit<APIApplicationCommand, "application_id" | "id">[] = [];

async function register() {
	console.log("Started refreshing application (/) commands.");
	await getInteractionCommands(commands);
	await rest
		.req("PUT", Routes.applicationCommands(application_id), commands)
		.then((res: any) => {
			res.errors
				? console.error(inspect(res.errors, { depth: Infinity }))
				: console.log(res);
		});
}

register();
