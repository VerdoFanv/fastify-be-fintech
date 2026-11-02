import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import * as client from 'prom-client'

/*
  Prometheus metrics are the usual scrape target for banking mid-tier stacks.
  Grafana dashboards/alerts sit on top; keep /metrics public for the scraper only
  (still bind privately in real deploys / network policies).
*/
const register = new client.Registry()
client.collectDefaultMetrics({ register })

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
})

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
})

async function metricsPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split('?')[0] ?? 'unknown'
    if (route === '/metrics') {
      return
    }
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    }
    const seconds = reply.elapsedTime / 1000
    httpRequestDuration.observe(labels, seconds)
    httpRequestsTotal.inc(labels)
  })

  fastify.get('/metrics', async (_request, reply) => {
    reply.header('content-type', register.contentType)
    return register.metrics()
  })
}

export default fp(metricsPlugin, { name: 'metrics' })
