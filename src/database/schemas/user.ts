import { Schema, model } from "mongoose";
import type { DBUserDoc } from "@database/interfaces/user.js";

const IssueRepoSettingsSchema = new Schema(
  {
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    auto_project: { type: String },
    auto_assignees: { type: [String], default: [] },
  },
  { _id: false }
);

const UserSchema = new Schema<DBUserDoc>(
  {
    discord: {
      id: { type: String, required: true, unique: true },
    },
    github: {
      id: { type: String, required: true, unique: true },
      login: { type: String, required: true },
      type: { type: String, required: true },
      access_token: { type: String, required: true },
    },
    settings: {
      issues: { type: [IssueRepoSettingsSchema], default: [] },
      misc: {
        ephemeral: { type: Boolean, default: false },
        simple: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

export default model<DBUserDoc>("User", UserSchema);
