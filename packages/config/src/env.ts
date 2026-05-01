import { z } from 'zod';

const DEV_SECRETS = [
  'dev-access-secret-change-in-prod',
  'dev-refresh-secret-change-in-prod',
];

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .default('false');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4501),
    DATABASE_URL: z.string().url(),
    ACCESS_TOKEN_SECRET: z.string().min(16),
    REFRESH_TOKEN_SECRET: z.string().min(16),
    ACCESS_TOKEN_EXPIRES_IN: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().int().positive().default(2592000),
    USE_REAL_AI: booleanFromString,
    USE_REAL_STORAGE: booleanFromString,
    USE_REAL_QUEUE: booleanFromString,
    USE_REAL_REALTIME: booleanFromString,
    USE_REAL_SPEECH: booleanFromString,
    USE_REAL_TRANSLATION: booleanFromString,
    OPENAI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    UPLOAD_DIR: z.string().default('./uploads'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:4500,http://localhost:4502')
      .transform((v) => v.split(',')),
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production') {
        return (
          !DEV_SECRETS.includes(data.ACCESS_TOKEN_SECRET) &&
          !DEV_SECRETS.includes(data.REFRESH_TOKEN_SECRET)
        );
      }
      return true;
    },
    { message: 'Dev secrets must be replaced in production' },
  );

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = parseEnv();
export type Config = typeof config;
