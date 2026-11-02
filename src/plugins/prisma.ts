import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@/config/env.js'
import { PrismaClient } from '@/generated/prisma/client.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

async function prismaPlugin(fastify: FastifyInstance): Promise<void> {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  await prisma.$connect()

  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })
}

export default fp(prismaPlugin, { name: 'prisma' })
