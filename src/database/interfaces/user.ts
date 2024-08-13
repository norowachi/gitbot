import { Document } from "mongoose";
import { UN } from "@utils";

/**
 * Options for the user document
 */
export interface DBUserOptions<T extends "init" | "update"> {
	discord: T extends "init" ? DBUser["discord"] : undefined;
	github: DBUser["github"];
}

/**
 * Reponses for the user document events
 */
export enum UserEnums {
	Success = "User linked successfully",
	GithubLinked = "This github account is already linked to a discord account",
	DiscordLinked = "This discord account is already linked to a github account",
}

/**
 * User Mongo document
 */
export type DBUserDoc = Document & DBUser;

/**
 * User document schema
 */
export interface DBUser {
	discord: {
		/**
		 * user id
		 */
		id: string;
	};
	github: {
		/**
		 * user id
		 */
		id: string;
		/**
		 * username, unique
		 */
		login: string;
		/**
		 * display name
		 */
		name: UN<string>;
		/**
		 * location
		 */
		location: UN<string>;
		/**
		 * user's bio
		 */
		bio: UN<string>;
		/**
		 * twitter username
		 */
		twitter: UN<string>;
		/**
		 * followers count
		 */
		followers: number;
		/**
		 * following count
		 */
		following: number;
		/**
		 * account creation date
		 */
		created_at: string;
		/**
		 * user's access token
		 */
		access_token: string;
	};
	settings: {
		/**
		 * issues conditions and settings on repos
		 */
		issues: [
			{
				owner: string;
				repo: string;
				auto_project?: string;
				auto_assignees?: string[];
			}
		];
		misc: {
			ephemeral: boolean;
		};
	};
}
