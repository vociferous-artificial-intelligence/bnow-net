import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = neon(url);
export const db = drizzle({ client: sql, schema });
/** raw neon client for parameterized bulk SQL (multi-row VALUES etc.) */
export const rawSql = sql;
export { schema };
