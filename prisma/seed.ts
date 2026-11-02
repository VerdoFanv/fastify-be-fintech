import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const DEMO_PASSWORD = 'test1234!'

async function upsertLedger(
  code: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
  currency = 'IDR',
) {
  return prisma.ledgerAccount.upsert({
    where: { code },
    update: { name, type, currency },
    create: { code, name, type, currency },
  })
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  await upsertLedger('CASH_IDR', 'Cash IDR', 'ASSET', 'IDR')
  await upsertLedger('CASH_USD', 'Cash USD', 'ASSET', 'USD')
  await upsertLedger('LOAN_PORTFOLIO_IDR', 'Loan Portfolio IDR', 'ASSET', 'IDR')
  await upsertLedger('LOAN_PORTFOLIO_USD', 'Loan Portfolio USD', 'ASSET', 'USD')
  await upsertLedger('INTEREST_INCOME_IDR', 'Interest Income IDR', 'INCOME', 'IDR')
  await upsertLedger('INTEREST_INCOME_USD', 'Interest Income USD', 'INCOME', 'USD')
  await upsertLedger('FX_CLEARING_IDR', 'FX Clearing IDR', 'ASSET', 'IDR')
  await upsertLedger('FX_CLEARING_USD', 'FX Clearing USD', 'ASSET', 'USD')
  await upsertLedger('FX_REVALUATION', 'FX Revaluation', 'EQUITY', 'IDR')

  await prisma.fxRate.upsert({
    where: {
      baseCurrency_quoteCurrency: { baseCurrency: 'IDR', quoteCurrency: 'USD' },
    },
    update: { rate: '0.00006200' },
    create: { baseCurrency: 'IDR', quoteCurrency: 'USD', rate: '0.00006200' },
  })
  await prisma.fxRate.upsert({
    where: {
      baseCurrency_quoteCurrency: { baseCurrency: 'USD', quoteCurrency: 'IDR' },
    },
    update: { rate: '16129.00000000' },
    create: { baseCurrency: 'USD', quoteCurrency: 'IDR', rate: '16129.00000000' },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      name: 'Bank Admin',
      passwordHash,
      role: 'ADMIN',
    },
    create: {
      email: 'admin@example.com',
      name: 'Bank Admin',
      passwordHash,
      role: 'ADMIN',
      customer: {
        create: {
          fullName: 'Bank Admin',
          kycStatus: 'APPROVED',
        },
      },
    },
  })

  if (!(await prisma.customer.findUnique({ where: { userId: admin.id } }))) {
    await prisma.customer.create({
      data: {
        userId: admin.id,
        fullName: 'Bank Admin',
        kycStatus: 'APPROVED',
      },
    })
  }

  const customerUser = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {
      name: 'Demo Customer',
      passwordHash,
      role: 'CUSTOMER',
    },
    create: {
      email: 'customer@example.com',
      name: 'Demo Customer',
      passwordHash,
      role: 'CUSTOMER',
      customer: {
        create: {
          fullName: 'Demo Customer',
          phone: '+628123456789',
          kycStatus: 'APPROVED',
        },
      },
    },
  })

  let customer = await prisma.customer.findUnique({ where: { userId: customerUser.id } })
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        userId: customerUser.id,
        fullName: 'Demo Customer',
        phone: '+628123456789',
        kycStatus: 'APPROVED',
      },
    })
  } else {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { kycStatus: 'APPROVED', fullName: 'Demo Customer' },
    })
  }

  const existingAccounts = await prisma.account.count({ where: { customerId: customer.id } })
  if (existingAccounts === 0) {
    const idrLeaf = await prisma.ledgerAccount.create({
      data: {
        code: `CUST-DEMO-IDR`,
        name: 'Demo Customer CHECKING IDR',
        type: 'LIABILITY',
        currency: 'IDR',
      },
    })
    const usdLeaf = await prisma.ledgerAccount.create({
      data: {
        code: `CUST-DEMO-USD`,
        name: 'Demo Customer SAVINGS USD',
        type: 'LIABILITY',
        currency: 'USD',
      },
    })

    const idrAccount = await prisma.account.create({
      data: {
        customerId: customer.id,
        ledgerAccountId: idrLeaf.id,
        productType: 'CHECKING',
        currency: 'IDR',
        accountNumber: '100000000001',
        balance: 0,
        status: 'ACTIVE',
      },
    })
    await prisma.account.create({
      data: {
        customerId: customer.id,
        ledgerAccountId: usdLeaf.id,
        productType: 'SAVINGS',
        currency: 'USD',
        accountNumber: '100000000002',
        balance: 0,
        status: 'ACTIVE',
      },
    })

    const cashIdr = await prisma.ledgerAccount.findUniqueOrThrow({ where: { code: 'CASH_IDR' } })
    const deposit = 10_000_000
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          reference: `SEED-DEP-${idrAccount.id}`,
          description: 'Seed initial IDR deposit',
          lines: {
            create: [
              { ledgerAccountId: cashIdr.id, debit: deposit, credit: 0 },
              { ledgerAccountId: idrLeaf.id, debit: 0, credit: deposit },
            ],
          },
        },
      })
      await tx.account.update({
        where: { id: idrAccount.id },
        data: { balance: deposit },
      })
    })
  }

  console.log('Seed completed.')
  console.log('Demo credentials (password for all):', DEMO_PASSWORD)
  console.log('- admin@example.com (ADMIN)')
  console.log('- customer@example.com (CUSTOMER, KYC APPROVED, funded IDR account)')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
