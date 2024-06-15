import {
	APIApplicationCommandOption,
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

export const CommandConsts = {
	/** */
	OwnerAndRepoOption: [
		{
			name: "owner",
			description: "The owner name",
			type: ApplicationCommandOptionType.String,
			required: true,
			autocomplete: true,
		},
		{
			name: "repo",
			description: "The repository name",
			type: ApplicationCommandOptionType.String,
			required: true,
			autocomplete: true,
		},
	] as APIApplicationCommandOption[],
	get Pulls() {
		return [
			{
				name: "list",
				description: "List maximum 25 of your pull requests",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...CommandConsts.OwnerAndRepoOption,
					{
						name: "state",
						description:
							"State of this Pull Request. Either `open`, `closed`, or `all`. Default `open`",
						type: ApplicationCommandOptionType.String,
						choices: [
							{
								name: "Open",
								value: "open",
							},
							{
								name: "Closed",
								value: "closed",
							},
							{
								name: "All",
								value: "all",
							},
						],
					},
					{
						name: "head",
						description:
							"Filter pulls by head and branch name in the format of `user:ref-name` or `organization:ref-name`.",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "base",
						description:
							"Filter pulls by base branch name. Example: `gh-pages`.",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "sort",
						description: "What to sort results by. Default is `created`",
						type: ApplicationCommandOptionType.String,
						choices: [
							{
								name: "Created",
								value: "created",
							},
							{
								name: "Updated",
								value: "updated",
							},
							{
								name: "Popularity",
								value: "popularity",
							},
							{
								name: "Long-Running",
								value: "long-running",
							},
						],
					},
					{
						name: "direction",
						description: "The direction of the sort. Default: `desc`",
						type: ApplicationCommandOptionType.String,
						choices: [
							{
								name: "Ascending",
								value: "asc",
							},
							{
								name: "Descending",
								value: "desc",
							},
						],
					},
					{
						name: "per_page",
						description: "How many items to list. Default is `10` (max 100)",
						type: ApplicationCommandOptionType.Integer,
					},
				],
			},
			{
				name: "create",
				description: "Create a new pull request",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "head",
						description:
							"The name of the branch where your changes are implemented.",
						type: ApplicationCommandOptionType.String,
						required: true,
					},
					{
						name: "base",
						description:
							"The name of the branch you want the changes pulled into on the current repository.",
						type: ApplicationCommandOptionType.String,
						required: true,
					},
					{
						name: "title",
						description:
							'The title of the new pull request. Required unless "issue" is specified.',
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "head_repo",
						description:
							"The name of the repository where the changes in the pull request were made.",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "issue",
						description:
							'The issue number in this repository to turn into a PR. Required unless "title" is specified.',
						type: ApplicationCommandOptionType.Integer,
					},
					{
						name: "body",
						description: "The contents of the pull request.",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "draft",
						description:
							"Whether the pull request is a draft. Default is false.",
						type: ApplicationCommandOptionType.Boolean,
					},
					{
						name: "maintainer_can_modify",
						description:
							"Whether maintainers can modify the pull request. Default is true.",
						type: ApplicationCommandOptionType.Boolean,
					},
				],
			},
			{
				name: "get",
				description: "Lists details of a pull request by providing its number.",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "pull_number",
						description: "The number of the pull request",
						type: ApplicationCommandOptionType.Integer,
						required: true,
					},
				],
			},
			{
				name: "update",
				description: "Merge a pull request",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "pull_number",
						description: "The number of the pull request",
						type: ApplicationCommandOptionType.Integer,
						required: true,
					},
					{
						name: "title",
						description: "The title of the pull request",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "body",
						description: "The contents of the pull request",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "state",
						description:
							"State of this Pull Request. Either `open` or `closed`",
						type: ApplicationCommandOptionType.String,
						choices: [
							{
								name: "Open",
								value: "open",
							},
							{
								name: "Closed",
								value: "closed",
							},
						],
					},
					{
						name: "base",
						description:
							"The name of the branch you want the changes pulled into on the current repository.",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "maintainer_can_modify",
						description:
							"Whether maintainers can modify the pull request. Default is true.",
						type: ApplicationCommandOptionType.Boolean,
					},
				],
			},
			{
				name: "list-commits",
				description: "Lists a maximum of 100 commits for a pull request.",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "pull_number",
						description: "The number of the pull request",
						type: ApplicationCommandOptionType.Integer,
						required: true,
					},
				],
			},
			{
				name: "check-merge",
				description: "Check if a pull request has been merged",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "pull_number",
						description: "The number of the pull request",
						type: ApplicationCommandOptionType.Integer,
						required: true,
					},
				],
			},
			{
				name: "merge",
				description: "Merge a pull request",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "pull_number",
						description: "The number of the pull request",
						type: ApplicationCommandOptionType.Integer,
						required: true,
					},
					{
						name: "commit_title",
						description: "Title for the commit message",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "commit_message",
						description: "Extra detail to append to automatic commit message.",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "sha",
						description: "SHA that pull request head must match to allow merge",
						type: ApplicationCommandOptionType.String,
					},
					{
						name: "merge_method",
						description: "Merge method to use",
						type: ApplicationCommandOptionType.String,
						choices: [
							{
								name: "Merge",
								value: "merge",
							},
							{
								name: "Rebase",
								value: "rebase",
							},
							{
								name: "Squash",
								value: "squash",
							},
						],
					},
				],
			},
			{
				name: "close",
				description: "Close a pull request",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					...this.OwnerAndRepoOption,
					{
						name: "pull_number",
						description: "The number of the pull request",
						type: ApplicationCommandOptionType.Integer,
						required: true,
					},
				],
			},
		] as APIApplicationCommandOption[];
	},
};
