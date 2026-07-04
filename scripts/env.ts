// Shared env loader for local scripts (Next.js loads .env.local itself; tsx does not).
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // .env fallback, does not override
