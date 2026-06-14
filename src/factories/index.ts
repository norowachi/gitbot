/**
 * Import all factory modules here.
 * Each module calls registry.registerFactory() as a side-effect on import.
 * This file is imported once in index.ts before any interactions arrive.
 */

export * from "./merge.js";
export * from "./unlink.js";
export * from "./pagination.js";
