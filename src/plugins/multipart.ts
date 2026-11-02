import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@/config/env.js'

async function multipartPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(multipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 1,
    },
  })
}

export default fp(multipartPlugin, { name: 'multipart' })
