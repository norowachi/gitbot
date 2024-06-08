import { Document } from "mongoose";

export interface DBUserOptions<T extends "init" | "update"> {
	discord: T extends "init" ? DBUser["discord"] : undefined;
	github: DBUser["github"];
}

export enum UserEnums {
	Success = "User linked successfully",
	GithubLinked = "This github account is already linked to a discord account",
	DiscordLinked = "This discord account is already linked to a github account",
	Error = "An error has occurred",
}

export type DBUserDoc = Document & DBUser;

export interface DBUser {
	discord: {
		id: string;
		username?: string;
	};
	github: {
		id: string;
		username?: string;
		name?: string;
		location?: string;
		bio?: string;
		twitter?: string;
		followers?: number;
		following?: number;
		created_at?: string;
		access_token?: string;
	};
}
