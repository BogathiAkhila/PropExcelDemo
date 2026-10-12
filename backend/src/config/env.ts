import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(5000),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  MASTER_DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  NEON_API_KEY: z.string().optional(),
  NEON_PROJECT_ID: z.string().optional(),
  NEON_BRANCH_ID: z.string().optional(),
  NEON_DATABASE_OWNER: z.string().optional(),
  TENANT_CONNECTION_BASE_URL: z.string().optional()
});

export const env = schema.parse(process.env);
