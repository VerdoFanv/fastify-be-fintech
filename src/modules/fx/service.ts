import type { FxExchange, FxRate, PrismaClient } from '@/generated/prisma/client.js'
import { badRequest, notFound } from '@/lib/errors.js'
import { emitDomainEvent } from '@/lib/events.js'
import { DOMAIN_TOPICS } from '@/lib/kafka.js'
import { getSystemLedgerAccount, postJournal, type JournalLineInput } from '@/lib/ledger.js'
import { assertPositive, money, moneyToString } from '@/lib/money.js'
import type { ExchangeBody, UpsertRateBody } from './schemas.js'

export function toFxRateDto(rate: FxRate) {
  return {
    ...rate,
    rate: rate.rate.toFixed(8),
  }
}

export function toFxExchangeDto(exchange: FxExchange) {
  return {
    ...exchange,
    fromAmount: moneyToString(exchange.fromAmount),
    toAmount: moneyToString(exchange.toAmount),
    rate: exchange.rate.toFixed(8),
  }
}

export async function upsertFxRate(prisma: PrismaClient, input: UpsertRateBody): Promise<FxRate> {
  const base = input.baseCurrency.toUpperCase()
  const quote = input.quoteCurrency.toUpperCase()
  if (base === quote) {
    throw badRequest('baseCurrency and quoteCurrency must differ')
  }
  const rate = assertPositive(money(input.rate))
  return prisma.fxRate.upsert({
    where: {
      baseCurrency_quoteCurrency: { baseCurrency: base, quoteCurrency: quote },
    },
    update: { rate },
    create: { baseCurrency: base, quoteCurrency: quote, rate },
  })
}

export async function listFxRates(prisma: PrismaClient): Promise<FxRate[]> {
  return prisma.fxRate.findMany({ orderBy: [{ baseCurrency: 'asc' }, { quoteCurrency: 'asc' }] })
}

/*
  Dual-currency FX in one balanced journal:
  Debit sell-side customer liability (fromAmount), credit buy-side liability (toAmount).
  Because fromAmount and toAmount differ numerically across currencies, FX_REVALUATION
  (EQUITY) plugs the difference so sum(debits)==sum(credits) still holds.
  Each customer Account stays single-currency — never mix IDR and USD in one Account.
*/
export async function exchangeCurrency(
  prisma: PrismaClient,
  customerId: string,
  input: ExchangeBody,
  meta?: { actorUserId?: string; requestId?: string },
): Promise<FxExchange> {
  const fromAmount = assertPositive(money(input.fromAmount))

  const exchange = await prisma.$transaction(async (tx) => {
    const [fromAccount, toAccount] = await Promise.all([
      tx.account.findUnique({ where: { id: input.fromAccountId } }),
      tx.account.findUnique({ where: { id: input.toAccountId } }),
    ])
    if (!fromAccount || !toAccount) {
      throw notFound('Account not found')
    }
    if (fromAccount.customerId !== customerId || toAccount.customerId !== customerId) {
      throw badRequest('Both FX accounts must belong to the customer')
    }
    if (fromAccount.currency === toAccount.currency) {
      throw badRequest('FX requires different account currencies')
    }
    if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') {
      throw badRequest('Both accounts must be ACTIVE')
    }
    if (fromAccount.balance.lt(fromAmount)) {
      throw badRequest('Insufficient funds')
    }

    const fxRate = await tx.fxRate.findUnique({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: fromAccount.currency,
          quoteCurrency: toAccount.currency,
        },
      },
    })
    if (!fxRate) {
      throw badRequest(`No FX rate for ${fromAccount.currency}/${toAccount.currency}`)
    }

    const toAmount = fromAmount.mul(fxRate.rate).toDecimalPlaces(4)
    const reval = await getSystemLedgerAccount(tx, 'FX_REVALUATION')
    const diff = toAmount.minus(fromAmount)

    const lines: JournalLineInput[] = [
      {
        ledgerAccountId: fromAccount.ledgerAccountId,
        debit: fromAmount,
        customerAccountId: fromAccount.id,
        customerBalanceDelta: fromAmount.negated(),
      },
      {
        ledgerAccountId: toAccount.ledgerAccountId,
        credit: toAmount,
        customerAccountId: toAccount.id,
        customerBalanceDelta: toAmount,
      },
    ]

    if (diff.gt(0)) {
      lines.push({ ledgerAccountId: reval.id, debit: diff })
    } else if (diff.lt(0)) {
      lines.push({ ledgerAccountId: reval.id, credit: diff.abs() })
    }

    const entry = await postJournal(tx, {
      reference: `FX-${Date.now()}`,
      description: `FX ${fromAccount.currency}->${toAccount.currency} @ ${fxRate.rate}`,
      lines,
    })

    return tx.fxExchange.create({
      data: {
        customerId,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        fromAmount,
        toAmount,
        rate: fxRate.rate,
        journalEntryId: entry.id,
      },
    })
  })

  await emitDomainEvent(prisma, {
    topic: DOMAIN_TOPICS.FX_EXCHANGED,
    action: 'fx.exchanged',
    resourceType: 'FxExchange',
    resourceId: exchange.id,
    actorUserId: meta?.actorUserId,
    requestId: meta?.requestId,
    data: {
      exchangeId: exchange.id,
      fromAmount: moneyToString(exchange.fromAmount),
      toAmount: moneyToString(exchange.toAmount),
      rate: exchange.rate.toFixed(8),
    },
  })

  return exchange
}
