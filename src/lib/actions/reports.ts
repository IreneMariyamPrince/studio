
'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Helper function to check and log Prisma init errors (assume it exists)
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Handle libssl error message specifically if needed
         return true;
     }
     return false;
}

// Helper to safely execute Prisma calls and handle init errors specifically
async function safePrismaCall<T>(prismaPromise: Promise<T>, fallback: T, tenantId: string | null, context: string): Promise<T> {
    if (!tenantId) {
        console.error(`[ACTION_ERROR] Tenant ID missing in ${context}.`);
        // Depending on the report, you might return fallback or throw
        return fallback; // Returning fallback for reports often makes sense
    }
    try {
        return await prismaPromise;
    } catch (error) {
        if (checkPrismaInitError(error, `${context} (Tenant: ${tenantId})`)) {
            console.warn(`Returning fallback data for ${context} for tenant ${tenantId} due to DB connection issue.`);
        } else {
            console.error(`[REPORT_ERROR] Error executing Prisma call in ${context} for tenant ${tenantId}:`, error);
        }
        return fallback; // Return fallback data on any error
    }
}


// --- Profit & Loss Report Data ---
export interface ProfitLossData {
    revenue: { accountId: string; accountName: string; total: number }[];
    expenses: { accountId: string; accountName: string; total: number }[];
    netProfit: number;
    startDate: Date;
    endDate: Date;
}

export async function getProfitLossData(startDate: Date, endDate: Date): Promise<ProfitLossData> {
    const tenantId = await getTenantId();
    const fallbackData: ProfitLossData = { revenue: [], expenses: [], netProfit: 0, startDate, endDate };
    if (!tenantId) return fallbackData;

    console.log(`Generating P&L from ${startDate.toISOString()} to ${endDate.toISOString()} for Tenant: ${tenantId}`);

    // --- More accurate P&L using Journal Entries ---
    const aggregationContext = `getProfitLossData Aggregation`;

    const accountAggregations = await safePrismaCall(
        prisma.journalEntryLine.groupBy({
            by: ['accountId'],
            where: {
                journalEntry: {
                    tenantId: tenantId,
                    entryDate: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                account: {
                    // Include only Revenue and Expense accounts relevant to P&L
                    type: { in: ['Revenue', 'Expense'] }
                }
            },
            _sum: {
                amount: true,
            },
            // We need to know the account type to correctly calculate the net change
            // Grouping by type directly isn't simple with sums, so fetch accounts separately or adjust logic
        }),
        [], tenantId, aggregationContext
    );

    // Fetch account details (name, type) for the aggregated IDs
    const accountIds = accountAggregations.map(agg => agg.accountId);
    const accounts = await safePrismaCall(
         prisma.account.findMany({
             where: { id: { in: accountIds }, tenantId: tenantId },
             select: { id: true, name: true, type: true }
         }),
         [], tenantId, `getProfitLossData Account Fetch`
     );
    const accountMap = new Map(accounts.map(acc => [acc.id, acc]));


    let totalRevenue = 0;
    let totalExpenses = 0;
    const revenueBreakdown: ProfitLossData['revenue'] = [];
    const expenseBreakdown: ProfitLossData['expenses'] = [];

    for (const agg of accountAggregations) {
        const account = accountMap.get(agg.accountId);
        if (!account) continue; // Should not happen if data is consistent

        const sum = agg._sum.amount?.toNumber() ?? 0;
        let netChange = 0;

        // Determine net change based on account type and typical balance
        // Credits increase Revenue, Debits increase Expenses
        // This simplified logic assumes sums reflect net activity correctly.
        // A more robust approach sums debits and credits separately per account.
        if (account.type === 'Revenue') {
            netChange = sum; // Simplified: Assume sum reflects net credit balance for revenue
            totalRevenue += netChange;
             revenueBreakdown.push({ accountId: account.id, accountName: account.name, total: netChange });
        } else if (account.type === 'Expense') {
            netChange = sum; // Simplified: Assume sum reflects net debit balance for expense
            totalExpenses += netChange;
             expenseBreakdown.push({ accountId: account.id, accountName: account.name, total: netChange });
        }
    }


    return {
        revenue: revenueBreakdown,
        expenses: expenseBreakdown,
        netProfit: totalRevenue - totalExpenses, // Revenue typically credits, Expenses debits
        startDate,
        endDate,
    };
}

// --- Balance Sheet Report Data ---
export interface BalanceSheetData {
    assets: { accountId: string; accountName: string; balance: number }[];
    liabilities: { accountId: string; accountName: string; balance: number }[];
    equity: { accountId: string; accountName: string; balance: number }[];
    totalAssets: number;
    totalLiabilitiesAndEquity: number;
    asOfDate: Date;
}

export async function getBalanceSheetData(asOfDate: Date): Promise<BalanceSheetData> {
     const tenantId = await getTenantId();
     const fallbackData: BalanceSheetData = { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilitiesAndEquity: 0, asOfDate };
     if (!tenantId) return fallbackData;

     console.log(`Generating Balance Sheet as of ${asOfDate.toISOString()} for Tenant: ${tenantId}`);

     // Fetch accounts directly, balance should be up-to-date via transactions
     const accountsData = await safePrismaCall(
         prisma.account.findMany({
             where: {
                 tenantId: tenantId,
                 isActive: true,
                 type: { in: ['Asset', 'Liability', 'Equity'] } // Only Balance Sheet accounts
             },
             select: { id: true, name: true, type: true, balance: true }
         }),
         [], tenantId, `getBalanceSheetData Account Fetch`
     );

     const assets: BalanceSheetData['assets'] = [];
     const liabilities: BalanceSheetData['liabilities'] = [];
     const equity: BalanceSheetData['equity'] = [];

     accountsData.forEach(acc => {
         const balance = acc.balance?.toNumber() ?? 0;
         const accountDetail = { accountId: acc.id, accountName: acc.name, balance: balance };
         if (acc.type === 'Asset') assets.push(accountDetail);
         else if (acc.type === 'Liability') liabilities.push(accountDetail);
         else if (acc.type === 'Equity') equity.push(accountDetail);
     });

     const totalAssets = assets.reduce((sum, acc) => sum + acc.balance, 0);
     const totalLiabilities = liabilities.reduce((sum, acc) => sum + acc.balance, 0);
     const totalEquity = equity.reduce((sum, acc) => sum + acc.balance, 0);

    // Basic check for accounting equation
    if (Math.abs(totalAssets - (totalLiabilities + totalEquity)) > 0.01) { // Tolerance
        console.warn(`Balance Sheet out of balance for Tenant ${tenantId}: Assets=${totalAssets}, Liab+Equity=${totalLiabilities + totalEquity}`);
    }

    return {
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
        asOfDate,
    };
}

// --- A/R Aging Report Data ---
export interface ARAgingData {
    clientId: string;
    clientName: string;
    invoiceId: string;
    invoiceNumber: string;
    dueDate: Date;
    invoiceTotal: number;
    amountDue: number; // Calculate based on payments received
    daysOverdue: number;
    bucket: 'Current' | '1-30' | '31-60' | '61-90' | '90+';
}

export async function getArAgingData(asOfDate: Date): Promise<ARAgingData[]> {
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    console.log(`Generating A/R Aging as of ${asOfDate.toISOString()} for Tenant: ${tenantId}`);

    const unpaidInvoices = await safePrismaCall(
        prisma.invoice.findMany({
            where: {
                tenantId: tenantId,
                status: { in: ['Pending', 'Partial', 'Overdue'] } // Include statuses representing money owed
            },
            include: {
                client: { select: { id: true, name: true } },
                payments: { select: { amount: true } } // Fetch payments to calculate amount due
            }
        }),
        [], tenantId, `getArAgingData Invoice Fetch`
    );

    const agingData: ARAgingData[] = [];
    const todayTime = asOfDate.getTime();

    unpaidInvoices.forEach(invoice => {
        const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
        const amountDue = invoice.total.toNumber() - totalPaid;

        if (amountDue <= 0.005) return; // Skip fully paid invoices (with tolerance)

        const dueDateTime = invoice.dueDate.getTime();
        const diffTime = todayTime - dueDateTime;
        const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24))); // Calculate days overdue (non-negative)

        let bucket: ARAgingData['bucket'];
        if (diffTime <= 0) { // Due date is today or in the future
            bucket = 'Current';
        } else if (diffDays <= 30) {
            bucket = '1-30';
        } else if (diffDays <= 60) {
            bucket = '31-60';
        } else if (diffDays <= 90) {
            bucket = '61-90';
        } else {
            bucket = '90+';
        }

        agingData.push({
            clientId: invoice.clientId,
            clientName: invoice.client.name,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.substring(0,4)}`,
            dueDate: invoice.dueDate,
            invoiceTotal: invoice.total.toNumber(),
            amountDue: amountDue,
            daysOverdue: diffDays > 0 ? diffDays : 0, // Show 0 if not overdue
            bucket: bucket,
        });
    });

    return agingData.sort((a, b) => b.daysOverdue - a.daysOverdue); // Sort by most overdue first
}

// --- Add other report data fetching functions as needed ---
// - Cash Flow Statement (requires careful analysis of JE lines and payment types)
// - A/P Aging (similar to A/R, but for Expenses/Vendors)
// - Expense by Category/Vendor
// - Budget vs. Actuals
