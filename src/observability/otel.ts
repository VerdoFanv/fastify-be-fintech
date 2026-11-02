import { env } from '@/config/env.js'

/*
  OpenTelemetry is the vendor-neutral tracing standard used across mid-size fintechs.
  Export OTLP to the collector → Tempo; Grafana visualizes. Disabled unless OTEL_ENABLED=true
  so local unit tests stay light.
*/
export async function startOpenTelemetry(): Promise<void> {
  if (!env.OTEL_ENABLED) {
    return
  }

  const { NodeSDK } = await import('@opentelemetry/sdk-node')
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node')
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
  const { Resource } = await import('@opentelemetry/resources')
  const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions')

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  })

  sdk.start()

  const shutdown = async () => {
    await sdk.shutdown()
  }
  process.once('SIGTERM', () => {
    shutdown().catch(() => undefined)
  })
  process.once('SIGINT', () => {
    shutdown().catch(() => undefined)
  })
}
