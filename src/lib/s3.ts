import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '@/config/env.js'

let client: S3Client | null = null

export function getS3Client(): S3Client {
  if (client) {
    return client
  }

  client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    ...(env.S3_ENDPOINT
      ? {
          endpoint: env.S3_ENDPOINT,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        }
      : {}),
  })

  return client
}

export async function uploadObject(params: {
  key: string
  body: Buffer
  contentType: string
}): Promise<void> {
  const s3 = getS3Client()
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  )
}

export function objectUrl(key: string): string {
  if (env.S3_ENDPOINT) {
    const base = env.S3_ENDPOINT.replace(/\/$/, '')
    return `${base}/${env.S3_BUCKET}/${key}`
  }
  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
}
