import { describe, expect, it } from 'vitest'
import { DOMAIN_TOPICS, topicToWebhookEvent } from '@/lib/kafka.js'

describe('kafka helpers', () => {
  it('maps domain topics to webhook event names', () => {
    expect(topicToWebhookEvent(DOMAIN_TOPICS.TRANSFER_POSTED)).toBe('transfer.posted')
    expect(topicToWebhookEvent(DOMAIN_TOPICS.KYC_REVIEWED)).toBe('kyc.reviewed')
  })
})
