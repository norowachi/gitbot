import {
  APIApplicationCommandBasicOption,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";

// ─── Console colors ───────────────────────────────────────────────────────────

export const ConsoleColors = {
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
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
} as const;

// ─── Emoji shortcuts ──────────────────────────────────────────────────────────

export const emojis = {
  arrowLeft: "⬅️",
  arrowRight: "➡️",
  cross: "❌",
  check: "✅",
} as const;

// ─── Reusable Discord command options ─────────────────────────────────────────

export const SharedOptions: Record<string, APIApplicationCommandBasicOption> = {
  owner: {
    name: "owner",
    description: "Repository owner (user or org)",
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
  repo: {
    name: "repo",
    description: "Repository name",
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
  pull_number: {
    name: "pull_number",
    description: "Pull request number",
    type: ApplicationCommandOptionType.Integer,
    required: true,
    autocomplete: true,
  },
  issue_number: {
    name: "issue_number",
    description: "Issue number",
    type: ApplicationCommandOptionType.Integer,
    required: true,
    autocomplete: true,
  },
};
