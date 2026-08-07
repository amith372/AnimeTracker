import type { Config } from 'drizzle-kit';

// Tells drizzle-kit where the schema lives and where to write generated SQL migration files —
// used by `npm run db:generate` whenever schema.ts changes.
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
