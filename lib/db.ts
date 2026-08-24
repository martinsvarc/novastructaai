import { neon } from "@neondatabase/serverless";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): (strings: TemplateStringsArray, ...values: any[]) => Promise<Record<string, any>[]> {
  if (cached) return cached;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  cached = neon(process.env.DATABASE_URL);
  return cached;
}
