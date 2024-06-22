//! LevelDB Schemas
/**
 * User schema for the database
 */
export interface LevelUser {
	login: string;
	repos?: LevelRepo[];
	last_updated: number;
}

/**
 * Repo schema for the database
 */
export interface LevelRepo {
	name: string;
	/**
	 * Pull request IDs (numbers)
	 */
	pulls: number[];
	/**
	 * Issue IDs (numbers)
	 */
	issues: number[];
}
