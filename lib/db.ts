import { neon } from "@neondatabase/serverless";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: any = null;

export function getDb() {
  if (cached) return cached as ReturnType<typeof neon>;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  cached = neon(process.env.DATABASE_URL);
  return cached as ReturnType<typeof neon>;
}
