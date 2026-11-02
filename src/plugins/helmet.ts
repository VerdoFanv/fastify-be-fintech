import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/*
  Banking-grade HTTP Security Headers (OWASP & PCI-DSS 4.0 requirement):
  - Strict-Transport-Security (HSTS): forces HTTPS with preloading
  - Content-Security-Policy (CSP): mitigates XSS, data injection
  - X-Frame-Options: DENY (prevents Clickjacking)
  - X-Content-Type-Options: nosniff (prevents MIME sniffing)
*/
async function helmetPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    // Allow Swagger UI to render assets without strict cross-origin restrictions
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: {
      action: 'deny',
    },
  })
}

export default fp(helmetPlugin, { name: 'helmet' })

