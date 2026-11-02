import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const loanScheduleSchema = z.object({
  id: z.string(),
  installment: z.number(),
  dueDate: z.coerce.date(),
  principal: z.string(),
  interest: z.string(),
  totalDue: z.string(),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE']),
  paidAt: z.coerce.date().nullable(),
})

export const loanSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  disbursementAccountId: z.string(),
  principal: z.string(),
  interestRateAnnual: z.string(),
  termMonths: z.number(),
  status: z.enum(['APPLIED', 'APPROVED', 'DISBURSED', 'REPAYING', 'CLOSED', 'REJECTED']),
  currency: z.string(),
  journalEntryId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  schedules: z.array(loanScheduleSchema).optional(),
})

export const applyLoanBodySchema = z.object({
  disbursementAccountId: z.string(),
  principal: z.string(),
  interestRateAnnual: z.string().default('12.0000'),
  termMonths: z.number().int().min(1).max(60),
  currency: z.string().length(3).default('IDR'),
})

export const repayBodySchema = z.object({
  scheduleId: z.string(),
  fromAccountId: z.string(),
})

export const loanResponseSchema = withPerformanceSchema({
  loan: loanSchema,
})

export const loanListResponseSchema = withPerformanceSchema({
  data: z.array(loanSchema),
})

export type ApplyLoanBody = z.infer<typeof applyLoanBodySchema>
export type RepayBody = z.infer<typeof repayBodySchema>
