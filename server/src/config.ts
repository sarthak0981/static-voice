import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.string().default('*'),
  TRUST_PROXY: z.union([z.string(), z.boolean(), z.coerce.number()]).default(false),
  MAX_ROOMS_GLOBAL: z.coerce.number().int().min(1).default(500),
  MAX_ROOMS_PER_IP: z.coerce.number().int().min(1).default(10),
  MAX_QUEUE_CAPACITY: z.coerce.number().int().min(1).default(200),
  TURN_SHARED_SECRET: z.string().optional(),
  TURN_HOST: z.string().optional(),
  TURN_SERVER_URL: z.string().optional(),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  TURN_PASSWORD: z.string().optional(),
  STUN_SERVERS: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

export type AppConfig = z.infer<typeof configSchema>;

function loadConfig(): AppConfig {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('CRITICAL: Invalid environment configuration:', result.error.format());
    process.exit(1);
  }

  const cfg = result.data;

  // Strict CORS in production: Fail fast if unset or wildcard
  if (cfg.NODE_ENV === 'production' && (cfg.CORS_ORIGIN === '*' || !cfg.CORS_ORIGIN)) {
    console.error('CRITICAL SECURITY ERROR: CORS_ORIGIN cannot be "*" or empty in production.');
    process.exit(1);
  }

  return cfg;
}

export const config = loadConfig();
