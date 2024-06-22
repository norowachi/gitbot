//! LevelDB Schemas
/**
 * User schema for the database
 */
export interface LevelUser {
	login: string;
	repos?: LevelRepo[];
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
	/**
	 * Labels (title/name)
	 */
	labels: string[];
}
