/**
 * Factories for /unlink confirmation buttons.
 *
 * Context shape: { discordId, cancelId } / { confirmId }
 */

import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { registry } from "@utils";
import { DeleteUser } from "@database/functions/user.js";
import { deleteCachedUser } from "@utils";

export interface UnlinkConfirmContext {
  discordId: string;
  cancelId: string;
}

export interface UnlinkCancelContext {
  confirmId: string;
}

registry.registerFactory<UnlinkConfirmContext>("unlink-confirm", (ctx) => async (res) => {
  await registry.unregister(ctx.cancelId);

  const deleted = await DeleteUser({ discordId: ctx.discordId });
  if (deleted) await deleteCachedUser(deleted.github.login);

  res.json({
    type: InteractionResponseType.UpdateMessage,
    data: {
      content: "Your account has been unlinked and all data deleted.",
      components: [],
      flags: MessageFlags.Ephemeral,
    },
  });
});

registry.registerFactory<UnlinkCancelContext>("unlink-cancel", (ctx) => async (res) => {
  await registry.unregister(ctx.confirmId);

  res.json({
    type: InteractionResponseType.UpdateMessage,
    data: {
      content: "Unlink cancelled. Your data is safe. 😌",
      components: [],
      flags: MessageFlags.Ephemeral,
    },
  });
});
