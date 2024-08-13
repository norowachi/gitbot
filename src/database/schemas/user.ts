import { Schema, model } from "mongoose";
import { DBUserDoc } from "../interfaces/user.js";

const UserData = new Schema<DBUserDoc>({
	discord: {
		id: { type: String, unique: true },
	},
	github: {
		id: { type: String, unique: true },
		login: String,
		name: String,
		location: String,
		bio: String,
		twitter: String,
		followers: Number,
		following: Number,
		created_at: String,
		access_token: String,
	},
	settings: {
		// issues conditions and settings on repos
		issues: [{ owner: String, repo: String, auto_project: String, auto_assignees: [String] }],
		misc: {
			ephemeral: Boolean,
		},
	},
});

const user = model("User", UserData);
export default user;
