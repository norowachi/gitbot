import { type Response } from "express";
import {
  type APIEmbed,
  type APIApplicationCommandInteraction,
  type APIActionRowComponent,
  type APIButtonComponent,
  ComponentType,
  ButtonStyle,
  InteractionResponseType,
  MessageFlags,
  type APIApplicationCommandInteractionDataOption,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import { ConsoleColors, emojis, commandsData, rest, registry } from "@utils";
import { type Endpoints } from "@octokit/types";

// ─── Command routing ──────────────────────────────────────────────────────────

export async function runCommand(name: string) {
  return (
    commandsData.get(name)?.run ??
    ((res: Response) =>
      res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Command not found.", flags: MessageFlags.Ephemeral },
      }))
  );
}

export async function runCommandAutoComplete(name: string) {
  return (
    commandsData.get(name)?.autocomplete ??
    ((res: Response) =>
      res.json({
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: { choices: [] },
      }))
  );
}

// ─── Options parsing ──────────────────────────────────────────────────────────

/** Recursively unwrap subcommand/group wrappers and return a flat option map. */
export function getOptionsValue(
  data: APIApplicationCommandInteractionDataOption[]
): Map<string, unknown> {
  for (const option of data) {
    if (
      option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
    ) {
      return getOptionsValue(option.options ?? []);
    }
  }
  const map = new Map<string, unknown>();
  for (const option of data) {
    if ("value" in option) map.set(option.name, option.value);
  }
  return map;
}

/** Recursively find the focused autocomplete field name. */
export function getFocusedField(data: APIApplicationCommandInteractionDataOption[]): string | null {
  for (const option of data) {
    if (
      option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
    ) {
      return getFocusedField(option.options ?? []);
    }
    if ("focused" in option && option.focused) return option.name;
  }
  return null;
}

/** Return the subcommand path as a string array, e.g. `["issues", "create"]`. */
export function getSub(
  dataOption?: APIApplicationCommandInteractionDataOption
): string[] | undefined {
  if (!dataOption) return undefined;
  if (dataOption.type === ApplicationCommandOptionType.SubcommandGroup) {
    return [dataOption.name, dataOption.options?.[0].name ?? ""];
  }
  if (dataOption.type === ApplicationCommandOptionType.Subcommand) {
    return [dataOption.name];
  }
  return undefined;
}

// ─── Console helpers ──────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DateInISO(shardId: number | null = null): string {
  return (
    ChangeConsoleColor("FgCyan", `[${new Date().toISOString()}]`) +
    (shardId !== null ? ChangeConsoleColor("FgMagenta", ` [${shardId}]`) : "")
  );
}

export function ChangeConsoleColor(
  color: keyof typeof ConsoleColors,
  ...values: unknown[]
): string {
  return `${ConsoleColors[color]}${values.join(" ")}${ConsoleColors.Reset}`;
}

// ─── Discord formatting ───────────────────────────────────────────────────────

export function DiscordTimestamp(date: string, format: "R" | "f" | "F"): string {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${format}>`;
}

export function Capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export type OctoErrorType = Partial<{
  response: { data: { errors: Record<string, string>[]; message: string; status: string } };
  status: string;
}>;

// ─── GitHub error formatting ──────────────────────────────────────────────────
export function OctoErrMsg(err: OctoErrorType): string {
  const body = err?.response?.data;
  if (!body) return "The operation did not complete successfully.";

  const errors = body.errors
    ?.map((e) =>
      Object.entries(e)
        .map(([k, v]) => `> ${Capitalize(k)}: \`${v}\``)
        .join("\n")
    )
    .join("\n\n");

  return `**${body.message ?? "GitHub Error"}**${
    errors ? `\nStatus: ${body.status ?? err?.status}\n${errors}` : ""
  }`;
}

/** Reply with a standardised ephemeral GitHub error message. */
export function octoErrResponse(res: Response, err: OctoErrorType): void {
  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: OctoErrMsg(err), flags: MessageFlags.Ephemeral },
  });
}

// ─── Discord character limits ─────────────────────────────────────────────────

export const LIMITS = {
  /** Max characters in a message content field */
  MESSAGE_CONTENT: 2000,
  /** Max characters in an embed description */
  EMBED_DESCRIPTION: 4096,
  /** Max characters in an embed field value */
  EMBED_FIELD_VALUE: 1024,
  /** Max characters in an embed title */
  EMBED_TITLE: 256,
  /** Max characters across the entire embed (all fields summed) */
  EMBED_TOTAL: 6000,
  /** Max embeds per message */
  EMBEDS_PER_MESSAGE: 10,
  /** Max fields per embed */
  FIELDS_PER_EMBED: 25,
    /** Discord Modal TextInput */
  MODAL_TEXT_INPUT: 4000,
} as const;

/**
 * Truncate a string to `max` characters, appending a suffix if cut.
 * Default suffix: "…"
 */
export function truncate(s: string, max: number, suffix = "…"): string {
  if (s.length <= max) return s;
  return s.slice(0, max - suffix.length) + suffix;
}

/**
 * Split a list of lines into pages where each page's joined text
 * stays within `maxChars`. Returns at least one page even if a
 * single line exceeds the limit (it is truncated).
 */
export function paginateLines(
  lines: string[],
  maxChars: number = LIMITS.MESSAGE_CONTENT,
  separator = "\n"
): string[] {
  const pages: string[] = [];
  let current = "";

  for (const line of lines) {
    const safe = truncate(line, maxChars);
    const candidate = current ? current + separator + safe : safe;

    if (candidate.length > maxChars) {
      if (current) pages.push(current);
      current = safe;
    } else {
      current = candidate;
    }
  }

  if (current) pages.push(current);
  return pages.length ? pages : [""];
}

/**
 * Build a paginated text response from a list of lines.
 * Returns an array of content strings, each safe to send as a Discord message.
 * Adds "Page X of Y" footer to each page when there is more than one.
 */
export function paginateContent(
  lines: string[],
  header: string,
  maxChars: number = LIMITS.MESSAGE_CONTENT
): string[] {
  // Reserve space for header + "\n" + "Page X of Y\n"
  const pageOverhead = header.length + 1 + "Page 99 of 99\n".length;
  const pages = paginateLines(lines, maxChars - pageOverhead);

  if (pages.length === 1) {
    return [`${header}\n${pages[0]}`];
  }

  return pages.map((page, i) => `${header}\n${page}\nPage ${i + 1} of ${pages.length}`);
}

/**
 * Safely truncate an embed description to the Discord limit.
 * Appends a "Read more" link when the body is cut.
 */
export function safeEmbedDescription(
  body: string | null | undefined,
  fallback: string,
  readMoreUrl?: string
): string {
  if (!body) return fallback;
  const limit = LIMITS.EMBED_DESCRIPTION;
  if (body.length <= limit) return body;

  const suffix = readMoreUrl ? `\n\n[**Read more…**](${readMoreUrl})` : "…";
  return body.slice(0, limit - suffix.length) + suffix;
}

/**
 * Safely truncate an embed field value to the Discord limit.
 */
export function safeFieldValue(value: string, fallback = "*None*"): string {
  if (!value) return fallback;
  return truncate(value, LIMITS.EMBED_FIELD_VALUE);
}

/**
 * Sends an embed paginator.  Registers prev/next button listeners and
 * automatically disables buttons after 15 minutes.
 */
/**
 * Send multiple plain-text pages as a paginated message.
 * Uses the same Redis-backed prev/next button system as embedMaker.
 * Each page must already be ≤ LIMITS.MESSAGE_CONTENT characters.
 */
export async function contentPager(res: Response, pages: string[], flags?: number): Promise<void> {
  if (pages.length === 1) {
    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: pages[0], flags },
    });
    return;
  }

  // Multi-page: wrap each string in a minimal embed so we reuse embedMaker.
  const embeds: APIEmbed[] = pages.map((page) => ({
    description: page,
    color: 0x5865f2,
  }));

  await embedMaker(res, embeds, flags);
}

export async function embedMaker(res: Response, embeds: APIEmbed[], flags?: number): Promise<void> {
  const interaction = res.req.body as APIApplicationCommandInteraction;
  const stamp = Date.now();
  const prevId = `prev-${stamp}`;
  const nextId = `next-${stamp}`;
  const TTL = 15 * 60; // 15 minutes

  const authorId = interaction.member?.user.id ?? interaction.user?.id;

  // Set footer on first page
  embeds[0].footer = { text: `Page 1 of ${embeds.length}` };

  const navRow: APIActionRowComponent<APIButtonComponent> = {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        emoji: { name: emojis.arrowLeft },
        custom_id: prevId,
        disabled: true,
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        emoji: { name: emojis.arrowRight },
        custom_id: nextId,
        disabled: embeds.length <= 1,
      },
    ],
  };

  res.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { embeds: [embeds[0]], components: [navRow], flags },
  });

  if (embeds.length <= 1) return;

  // Persist pagination state in Redis via the registry
  const paginationCtx = {
    authorId: authorId ?? "",
    embedsJson: JSON.stringify(embeds),
    page: 0,
    prevId,
    nextId,
    token: interaction.token,
    ttlSeconds: TTL,
  };

  await registry.register({
    customId: prevId,
    factory: "pagination-prev",
    context: paginationCtx as unknown as Record<string, unknown>,
    ttlSeconds: TTL,
    once: true,
    authorId: authorId ?? undefined,
  });

  await registry.register({
    customId: nextId,
    factory: "pagination-next",
    context: paginationCtx as unknown as Record<string, unknown>,
    ttlSeconds: TTL,
    once: true,
    authorId: authorId ?? undefined,
  });

  // After TTL, disable the buttons via REST (best-effort)
  setTimeout(() => {
    const disabledRow: APIActionRowComponent<APIButtonComponent> = {
      type: ComponentType.ActionRow,
      components: [
        { ...navRow.components[0], disabled: true },
        { ...navRow.components[1], disabled: true },
      ],
    };
    rest
      .req("PATCH", `/webhooks/${rest.me.id}/${interaction.token}/messages/@original`, {
        body: { components: [disabledRow] },
      })
      .catch(() => null);
  }, TTL * 1000);
}

// ─── Embed builders ───────────────────────────────────────────────────────────

export function CreateIssueEmbed(
  data: Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["response"]["data"]
): APIEmbed {
  const labelValue =
    data.labels?.length > 0
      ? safeFieldValue(
          data.labels.map((l) => `\`${typeof l === "string" ? l : l.name}\``).join(", ")
        )
      : "None";

  const embed: APIEmbed = {
    title: truncate(`${data.title} #${data.number}`, LIMITS.EMBED_TITLE),
    url: data.html_url,
    author: {
      name: truncate(`${data.user?.login} (${data.author_association})`, 256),
      icon_url: data.user?.avatar_url,
      url: data.user?.html_url,
    },
    description: safeEmbedDescription(data.body, "*No description provided.*", data.html_url),
    color: data.state === "open" ? 0x2da44e : 0x8250df,
    fields: [
      {
        name: "Labels",
        value: labelValue,
        inline: true,
      },
      {
        name: "State",
        value: safeFieldValue(
          [
            `**${Capitalize(data.state)}**`,
            data.state === "closed" && data.closed_at
              ? `Closed ${DiscordTimestamp(data.closed_at, "R")}${
                  data.closed_by
                    ? ` by [\`${data.closed_by.login}\`](${data.closed_by.html_url})`
                    : ""
                }`
              : `Opened ${DiscordTimestamp(data.created_at, "R")}`,
          ].join("\n")
        ),
        inline: true,
      },
      {
        name: "Misc",
        value: safeFieldValue(
          [
            `**Comments**: ${data.comments}`,
            `**Locked**: ${data.locked}${
              data.locked && data.active_lock_reason ? ` (${data.active_lock_reason})` : ""
            }`,
          ].join("\n")
        ),
        inline: true,
      },
    ],
  };

  if (data.assignees?.length) {
    embed.fields!.unshift({
      name: "Assignees",
      value: safeFieldValue(
        data.assignees.map((a) => `[\`${a.login}\`](${a.html_url})`).join(", ")
      ),
      inline: false,
    });
  }

  return embed;
}

export function CreatePREmbed(
  data: Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"]
): APIEmbed {
  const isMerged = data.merged;
  const color = isMerged ? 0x8250df : data.state === "open" ? 0x2da44e : 0xcf222e;

  const embed: APIEmbed = {
    title: truncate(`${data.title} #${data.number}`, LIMITS.EMBED_TITLE),
    url: data.html_url,
    author: {
      name: truncate(`${data.user.login} (${data.author_association})`, 256),
      icon_url: data.user.avatar_url,
      url: data.user.html_url,
    },
    description: safeEmbedDescription(data.body, "*No description provided.*", data.html_url),
    color,
    fields: [
      {
        name: "Branches",
        value: safeFieldValue(
          `[\`${data.head.label}\`](${data.head.repo?.html_url}) → [\`${data.base.label}\`](${data.base.repo.html_url})`
        ),
        inline: false,
      },
      {
        name: "Changes",
        value: safeFieldValue(
          [
            "```diff",
            `+ ${data.additions} additions`,
            `- ${data.deletions} deletions`,
            "```",
            `[${data.changed_files} file(s)](${data.html_url}/files) · [${data.commits} commit(s)](${data.html_url}/commits)`,
          ].join("\n")
        ),
        inline: true,
      },
      {
        name: "Labels",
        value: safeFieldValue(
          data.labels?.length ? data.labels.map((l) => `\`${l.name}\``).join(", ") : "None"
        ),
        inline: true,
      },
      {
        name: "Status",
        value: safeFieldValue(
          [
            `**State**: ${Capitalize(data.state)}`,
            `**Draft**: ${data.draft}`,
            isMerged
              ? `**Merged**: ${DiscordTimestamp(data.merged_at!, "R")} by [\`${data.merged_by?.login}\`](${data.merged_by?.html_url})`
              : `**Mergeable**: ${data.mergeable ?? "unknown"}`,
            `**Locked**: ${data.locked}`,
          ].join("\n")
        ),
        inline: true,
      },
    ],
  };

  if (data.assignees?.length) {
    embed.fields!.push({
      name: "Assignees",
      value: safeFieldValue(
        data.assignees.map((a) => `[\`${a.login}\`](${a.html_url})`).join(", ")
      ),
      inline: true,
    });
  }

  if (data.requested_reviewers?.length) {
    embed.fields!.push({
      name: "Requested Reviewers",
      value: safeFieldValue(
        data.requested_reviewers.map((r) => `[\`${r.login}\`](${r.html_url})`).join(", ")
      ),
      inline: true,
    });
  }

  return embed;
}

// ─── Kernel event helpers ─────────────────────────────────────────────────────

/**
 * Emit a "github:action" kernel event so the Streak module (and any other
 * module listening) can record write operations.
 *
 * Import `emitAction` in any command that performs a successful GitHub write.
 * The kernel singleton is accessed lazily to avoid circular imports.
 */
export async function emitAction(discordId: string): Promise<void> {
  // Lazy import to avoid circular: utils → kernel → utils
  const { kernel } = await import("../../index.js").catch(() => ({ kernel: null }));
  kernel?.emit("github:action", discordId);
}
