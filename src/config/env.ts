import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  API_KEY: z.string().min(16),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.union([z.url(), z.literal('')]).optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),
  REDIS_URL: z.string().default(''),
  KAFKA_BROKERS: z.string().default(''),
  KAFKA_CLIENT_ID: z.string().default('fintech-api'),
  KAFKA_GROUP_ID: z.string().default('fintech-webhook-workers'),
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().default('fastify-be-fintech'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables')
  }

  const { data } = parsed
  return {
    ...data,
    S3_ENDPOINT: data.S3_ENDPOINT || undefined,
  }
}

export const env = loadEnv()

export function kafkaBrokers(): string[] {
  return env.KAFKA_BROKERS.split(',')
    .map((b) => b.trim())
    .filter(Boolean)
}

export function isKafkaEnabled(): boolean {
  return kafkaBrokers().length > 0
}
