import { Schema, model } from "mongoose";

const UserData = new Schema({
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
});

const user = model("User", UserData);
export default user;
