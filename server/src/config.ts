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

  // Auto-detect Render environment variables
  if (process.env.RENDER) {
    if (!cfg.TRUST_PROXY) {
      cfg.TRUST_PROXY = 1;
    }
    if ((cfg.CORS_ORIGIN === '*' || !cfg.CORS_ORIGIN) && process.env.RENDER_EXTERNAL_URL) {
      cfg.CORS_ORIGIN = process.env.RENDER_EXTERNAL_URL;
    }
  }

  // In production, log warning if CORS_ORIGIN is not locked down, but allow boot
  if (cfg.NODE_ENV === 'production' && (cfg.CORS_ORIGIN === '*' || !cfg.CORS_ORIGIN)) {
    console.warn('SECURITY NOTICE: CORS_ORIGIN is not explicitly restricted in production. Allowing all origins by default. For higher security, set CORS_ORIGIN to your custom domain in your host environment variables.');
  }

  return cfg;
}

export const config = loadConfig();
