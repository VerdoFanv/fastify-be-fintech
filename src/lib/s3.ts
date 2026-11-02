import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
      // Enforce server-side encryption at rest (PCI-DSS & banking compliance baseline)
      ServerSideEncryption: 'AES256',
    }),
  )
}

/**
 * Generate a short-lived presigned URL (default 5 minutes) for accessing confidential KYC PII.
 * Ensures the bucket remains fully private without public read exposure.
 */
export async function getPresignedKycUrl(key: string, expiresIn = 300): Promise<string> {
  const s3 = getS3Client()
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

export function objectUrl(key: string): string {
  if (env.S3_ENDPOINT) {
    const base = env.S3_ENDPOINT.replace(/\/$/, '')
    return `${base}/${env.S3_BUCKET}/${key}`
  }
  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
}
