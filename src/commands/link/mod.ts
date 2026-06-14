import {
  type APIInteraction,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
} from "discord-api-types/v10";
import {
  type CommandData,
  Errors,
  encryptToken,
  env,
  ghLinks,
  IntEmitter,
  octoErrResponse,
} from "@utils";
import { getUser, InitUser } from "@database/functions/user.js";
import { randomBytes, createHash } from "node:crypto";
import { Octokit } from "@octokit/rest";
import type { Response } from "express";

const LINK_TTL_MS = 10 * 60 * 1000;

export default {
  name: "link",
  description: "Link your GitHub account to Gitbot",
  type: ApplicationCommandType.ChatInput,
  contexts: [0, 1, 2],
  integration_types: [0, 1],

  run: async (res) => {
    const interaction = res.req.body as APIInteraction;
    const userId = interaction.member?.user.id ?? interaction.user?.id;

    if (!userId) {
      return res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: Errors.NoUserId, flags: MessageFlags.Ephemeral },
      });
    }

    // Check if already linked so we can show the right message below
    const existingUser = await getUser({ discordId: userId });

    const state = createHash("sha256").update(randomBytes(16)).digest("hex");
    ghLinks.set(state, userId);
    setTimeout(() => ghLinks.delete(state), LINK_TTL_MS);

    const components = [];

    // OAuth "Sign in" button (only if GitHub App credentials are configured)
    if (env.GITHUB_CLIENT_NAME && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      components.push({
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: "Sign in with GitHub",
        url: `${env.SITE_URL}/github/verify/${state}`,
      });
    }

    // PAT modal button
    components.push({
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      label: "Use a Personal Access Token",
      custom_id: `keybtn-${userId}`,
    });

    res.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: existingUser
          ? [
              `You are currently linked as [\`${existingUser.github.login}\`](https://github.com/${existingUser.github.login}).`,
              "To **rotate your token**, choose a method below. Your settings will be preserved.",
              "",
              "> **Note:** To use Gitbot with external repositories you may need a Classic token.",
              "> [(Why?)](<https://github.com/orgs/community/discussions/106661#discussioncomment-10114091>)",
            ].join("\n")
          : [
              "Link your GitHub account to use Gitbot's commands. This link expires in **10 minutes**.",
              "",
              "> **Note:** To use Gitbot with external repositories you may need a Classic token.",
              "> [(Why?)](<https://github.com/orgs/community/discussions/106661#discussioncomment-10114091>)",
            ].join("\n"),
        flags: MessageFlags.Ephemeral,
        components: [{ type: ComponentType.ActionRow, components }],
      },
    });

    // Handle PAT modal button
    const keyBtnId = `keybtn-${userId}`;
    IntEmitter.once(keyBtnId, async (btnRes: Response) => {
      await showKeyModal(userId, btnRes).catch(() => null);
    });

    setTimeout(() => IntEmitter.removeAllListeners(keyBtnId), LINK_TTL_MS);
    return;
  },
} as CommandData;

async function showKeyModal(userId: string, res: Response): Promise<void> {
  const submitId = `keysubmit-${userId}`;

  res.json({
    type: InteractionResponseType.Modal,
    data: {
      title: "Add Personal Access Token",
      custom_id: submitId,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              style: TextInputStyle.Paragraph,
              label: "GitHub Personal Access Token",
              placeholder: "ghp_...",
              custom_id: "key",
              required: true,
            },
          ],
        },
      ],
    },
  });

  IntEmitter.once(submitId, async (modalRes: Response, int: any) => {
    const key: string = int.data.components[0].components[0].value;
    if (!key?.trim()) {
      modalRes.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Token cannot be empty.", flags: MessageFlags.Ephemeral },
      });
      return;
    }

    const authData = await new Octokit({ auth: key }).users.getAuthenticated().catch((e) => {
      octoErrResponse(modalRes, e);
      return null;
    });

    if (!authData) return;

    const gh = authData.data;

    const existingUser = await getUser({ discordId: userId });

    const acceptId = `accept-${userId}-${Date.now()}`;
    const rejectId = `reject-${userId}-${Date.now()}`;

    modalRes.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: existingUser
          ? [
              `Rotate token for [\`${existingUser.github.login}\`](${existingUser.github.login && `https://github.com/${existingUser.github.login}`})?`,
              `New GitHub account: [\`${gh.login}\`](${gh.html_url})`,
              existingUser.github.id !== gh.id.toString()
                ? "\n⚠️ This will **switch** your linked GitHub account. Your settings will be reset."
                : "\nYour settings will be preserved.",
            ].join("\n")
          : [
              "Confirm linking this GitHub account:",
              `Username: [\`${gh.login}\`](${gh.html_url})`,
            ].join("\n"),
        flags: MessageFlags.Ephemeral,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Success,
                label: "Confirm",
                custom_id: acceptId,
              },
              {
                type: ComponentType.Button,
                style: ButtonStyle.Danger,
                label: "Cancel",
                custom_id: rejectId,
              },
            ],
          },
        ],
      },
    });

    const cleanup = () => {
      IntEmitter.removeAllListeners(acceptId);
      IntEmitter.removeAllListeners(rejectId);
    };

    IntEmitter.once(acceptId, async (btnRes: Response) => {
      cleanup();
      const result = await InitUser({
        discord: { id: userId },
        github: {
          id: gh.id.toString(),
          login: gh.login,
          type: gh.type,
          access_token: encryptToken(key),
        },
      });

      if (typeof result === "string") {
        btnRes.json({
          type: InteractionResponseType.UpdateMessage,
          data: { content: result, components: [], flags: MessageFlags.Ephemeral },
        });
        return;
      }

      const isRotation = existingUser !== null;

      btnRes.json({
        type: InteractionResponseType.UpdateMessage,
        data: {
          content: isRotation
            ? `✅ Token rotated for [\`${gh.login}\`](${gh.html_url}) successfully!`
            : `✅ Linked [\`${gh.login}\`](${gh.html_url}) successfully!\nUse \`/help\` or check the [guide](https://noro.cc/gitbot/guide) to get started.`,
          components: [],
          flags: MessageFlags.Ephemeral,
        },
      });
    });

    IntEmitter.once(rejectId, (btnRes: Response) => {
      cleanup();
      btnRes.json({
        type: InteractionResponseType.UpdateMessage,
        data: { content: "Linking cancelled.", components: [], flags: MessageFlags.Ephemeral },
      });
    });

    setTimeout(cleanup, LINK_TTL_MS);
  });
}
