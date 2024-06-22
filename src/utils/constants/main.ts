import {
	APIApplicationCommandBasicOption,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";

/**
 * console coloring!
 */
export const ConsoleColors = {
	Reset: "\x1b[0m",
	Bright: "\x1b[1m",
	Dim: "\x1b[2m",
	Underscore: "\x1b[4m",
	Blink: "\x1b[5m",
	Reverse: "\x1b[7m",
	Hidden: "\x1b[8m",

	FgBlack: "\x1b[30m",
	FgRed: "\x1b[31m",
	FgGreen: "\x1b[32m",
	FgYellow: "\x1b[33m",
	FgBlue: "\x1b[34m",
	FgMagenta: "\x1b[35m",
	FgCyan: "\x1b[36m",
	FgWhite: "\x1b[37m",

	BgBlack: "\x1b[40m",
	BgRed: "\x1b[41m",
	BgGreen: "\x1b[42m",
	BgYellow: "\x1b[43m",
	BgBlue: "\x1b[44m",
	BgMagenta: "\x1b[45m",
	BgCyan: "\x1b[46m",
	BgWhite: "\x1b[47m",
};

export const emojis = {
	cross: "❌",
	rock: "🪨",
	paper: "📄",
	scissors: "✂️",
	arrowLeft: "⬅️",
	arrowRight: "➡️",
};

/**
 * General Options
 */
export const RequiredOptions: Record<string, APIApplicationCommandBasicOption> =
	{
		owner: {
			name: "owner",
			description: "The owner name",
			type: ApplicationCommandOptionType.String,
			required: true,
			autocomplete: true,
		},
		repo: {
			name: "repo",
			description: "The repository name",
			type: ApplicationCommandOptionType.String,
			required: true,
			autocomplete: true,
		},
		pull_number: {
			name: "pull_number",
			description: "The number of the pull request",
			type: ApplicationCommandOptionType.Integer,
			required: true,
			autocomplete: true,
		},
		issue_number: {
			name: "issue_number",
			description: "The number of the issue",
			type: ApplicationCommandOptionType.Integer,
			required: true,
			autocomplete: true,
		},
	};
