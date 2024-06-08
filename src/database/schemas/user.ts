import { Schema, model, models } from "mongoose";

const UserData = new Schema({
	discord: {
		id: { type: String, unique: true },
		username: String,
	},
	github: {
		id: { type: String, unique: true },
		username: String,
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

const user = models.user || model("User", UserData);
export default user;
