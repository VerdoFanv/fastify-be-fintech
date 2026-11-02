import dns from 'node:dns/promises'
import { isIP } from 'node:net'
import { env } from '@/config/env.js'
import { badRequest } from '@/lib/errors.js'

/*
  Anti-SSRF Protection for Webhooks & External Outbound HTTP Requests:
  Blocks SSRF attacks against:
  - AWS/GCP/Azure Cloud Metadata (169.254.169.254 / metadata.google.internal)
  - RFC 1918 Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Loopback (127.0.0.0/8, ::1, localhost)
  - Link-local, carrier-grade NAT, broadcast, and unspecified addresses
  - Common internal docker/k8s service names (postgres, redis, kafka, minio)
*/

export function isPrivateOrReservedIP(ip: string): boolean {
  // IPv4 check
  if (ip.includes('.')) {
    const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return true
    }

    const [a, b] = parts as [number, number, number, number]

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true
    // 10.0.0.0/8 (RFC 1918 Private)
    if (a === 10) return true
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true
    // 169.254.0.0/16 (Link-Local / Cloud Instance Metadata)
    if (a === 169 && b === 254) return true
    // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true
    // 192.168.0.0/16 (RFC 1918 Private)
    if (a === 192 && b === 168) return true
    // 100.64.0.0/10 (Shared Address Space / CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true
    // 240.0.0.0/4 (Reserved / Broadcast)
    if (a >= 240) return true

    return false
  }

  // IPv6 check
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  // IPv6 link-local (fe80::/10)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true
  }
  // IPv6 unique local (fc00::/7)
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true
  }
  // IPv4-mapped IPv6 (::ffff:192.168.x.x)
  if (lower.startsWith('::ffff:')) {
    const v4part = lower.replace('::ffff:', '')
    return isPrivateOrReservedIP(v4part)
  }

  return false
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'postgres',
  'redis',
  'kafka',
  'minio',
  'fintech-api',
])

export async function assertSafeWebhookUrl(urlString: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    throw badRequest('Invalid webhook URL format')
  }

  if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw badRequest('Webhook URL must use HTTPS in production')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw badRequest('Webhook URL protocol must be HTTP or HTTPS')
  }

  const hostname = parsed.hostname.toLowerCase().trim()

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw badRequest('Webhook URL cannot target internal hostnames')
  }

  // Direct IP in hostname
  if (isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) {
      throw badRequest('Webhook URL cannot target private, loopback, or cloud-metadata IP addresses')
    }
    return parsed
  }

  // Resolve DNS to prevent hostname pointing to private IP or AWS metadata
  try {
    const addresses = await dns.lookup(hostname, { all: true })
    const privateAddr = addresses.find((addr) => isPrivateOrReservedIP(addr.address))
    if (privateAddr) {
      throw badRequest('Webhook URL resolves to a prohibited private, loopback, or cloud-metadata IP address')
    }
  } catch (err) {
    if (err instanceof Error && 'statusCode' in err) throw err
    throw badRequest(`Cannot resolve webhook hostname: ${hostname}`)
  }

  return parsed
}
