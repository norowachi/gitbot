import {
	APIInteraction,
	InteractionResponseType,
	MessageFlags,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { Response } from "express";
import { EventEmitter } from "events";
import { Octokit } from "@octokit/rest";
import { DBUser } from "@database/interfaces/user.js";
import { DiscordRestClient } from "@utils";

/**
 * General Repeatitive Errors
 */
export enum Errors {
	Unexpected = "An unexpected error has occurred",
}

/**
 * Custom emitter to handle (custom?) interaction events
 */
export class CustomIntEmitter extends EventEmitter {
	emit(event: string | any, args: [Response, APIInteraction]): boolean {
		const response = args[0] as Response;

		// remove listener after 30mins
		setTimeout(() => {
			if (!event) return;
			super.removeAllListeners(event);
		}, 30 * 60 * 1000);

		// Call the original emit method to emit the event
		const result = super.emit(event, ...args);
		// check if response not sent then send
		if (!result && response.writable) {
			response.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: Errors.Unexpected,
					flags: MessageFlags.Ephemeral,
				},
			});
			return false;
		}
		return result;
	}
}

/**
 * The data for a command.
 * @param name - The name of the command.
 * @param description - The description of the command.
 * @param run - The function to run when the command is called.
 */
export interface CommandData
	extends Omit<
		RESTPostAPIApplicationCommandsJSONBody,
		"id" | "application_id"
	> {
	/**
	 * | NAME | TYPE | DESCRIPTION
	 * | --- | --- | --- |
	 * | `GUILD` | 0 | Interaction can be used within servers
	 * | `BOT_DM` | 1 | Interaction can be used within DMs with the app's bot user
	 * | `PRIVATE_CHANNEL` | 2 | Interaction can be used within Group DMs and DMs other than the app's bot user
	 */
	contexts: number[];
	/**
	 *
	 * | TYPE | ID | DESCRIPTION
	 * | --- | --- | --- |
	 * | `GUILD_INSTALL` | 0 |App is installable to servers
	 * | `USER_INSTALL` | 1 | App is installable to users
	 */
	integration_types: number[];
	/**
	 *
	 * @param res Response object
	 *
	 * ~@param interaction Interaction object~
	 * @param interaction can be accessed thru `res.req.body`
	 * @param rest {DiscordRestClient} Discord REST client
	 * @param [user, octokit] Db user object and octokit class passed in commands
	 * @param sub subcommand group and subcommand if any in [subcommand group, subcommand] or [subcommand] way
	 * @param options options object filteredas a Record of key option name
	 * @returns
	 */
	run: (
		res: Response,
		rest: DiscordRestClient,
		[user, octokit]: [DBUser, Octokit] | [],
		sub?: string[],
		options?: Map<string, any>
	) => any;
	/**
	 * @param res Response object
	 * @param interaction Interaction object
	 * @param focused The focused field
	 * @param [user, octokit] Db user object and octokit class passed in commands
	 * @param options options object filtered as a Record of key option name
	 * @returns
	 */
	autocomplete?: (
		res: Response,
		focused: string,
		[user, octokit]: [DBUser, Octokit],
		options?: Map<string, any>
	) => any;
}

/**
 * converts a type to <undefined | null | "type">
 */
export type UN<Type> = undefined | null | Type;
