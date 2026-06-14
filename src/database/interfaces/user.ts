import { Document } from "mongoose";

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum UserEnums {
  Success = "User linked successfully",
  GithubLinked = "This GitHub account is already linked to a Discord account",
  DiscordLinked = "This Discord account is already linked to a GitHub account",
}

// ─── Per-repo issue customisers ───────────────────────────────────────────────

export interface IssueRepoSettings {
  owner: string;
  repo: string;
  /** GitHub ProjectV2 node_id to auto-add issues into */
  auto_project?: string;
  /** GitHub logins auto-assigned to new issues */
  auto_assignees?: string[];
}

// ─── User settings ────────────────────────────────────────────────────────────

export interface DBUserSettings {
  /** Per-repository issue customisers */
  issues: IssueRepoSettings[];
  misc: {
    /** Send responses as ephemeral (hidden) messages */
    ephemeral: boolean;
    /** Send compact text responses instead of rich embeds */
    simple: boolean;
  };
}

// ─── Core user document ───────────────────────────────────────────────────────

export interface DBUser {
  discord: {
    id: string;
  };
  github: {
    id: string;
    login: string;
    type: string;
    /** AES-256-CBC encrypted access token stored as "iv:ciphertext" */
    access_token: string;
  };
  settings: DBUserSettings;
}

export type DBUserDoc = Document &
  DBUser & {
    createdAt: Date;
    updatedAt: Date;
  };

// ─── InitUser options ─────────────────────────────────────────────────────────

export interface InitUserOptions {
  discord: DBUser["discord"];
  github: DBUser["github"];
}
