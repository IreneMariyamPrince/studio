
'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';

// Centralized flag to track if a critical init error occurred
let prismaInitializationFailed = false;
let libsslErrorLogged = false; // Flag to log libssl error only once per request cycle

// Helper function to check and log Prisma init errors
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         prismaInitializationFailed = true; // Set the flag
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging
         } else if (!error.message.includes('libssl')) {
             console.error(`DATABASE CONNECTION FAILED (${context}): Prisma failed to initialize. Check database connection details and server logs.`);
         }
         return true; // Indicate an init error occurred
     }
     return false; // Not an init error
}


// --- Profit & Loss Report Data ---
export interface ProfitLossData {
    revenue: { accountName: string; total: number }[];
    expenses: { accountName: string; total: number }[];
    netProfit: number;
    startDate: Date;
    endDate: Date;
}

export async function getProfitLossData(startDate: Date, endDate: Date): Promise<ProfitLossData> {
    // Reset flags for this request
    prismaInitializationFailed = false;
    libsslErrorLogged = false;

    console.log(`Generating P&L from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    // Placeholder implementation
    // 1. Fetch sum of amounts for all Revenue accounts within the date range (using Journal Entries or simplified logic)
    // 2. Fetch sum of amounts for all Expense accounts within the date range (using Journal Entries or Expense records)
    // 3. Calculate Net Profit

    let revenueTotal = 0; // Placeholder
    let expenseTotal = 0; // Placeholder

    // Example using safePrismaCall - adjust actual queries as needed
    const revenueData = await safePrismaCall(
        prisma.account.findMany({ where: { type: 'Revenue' }, select: { name: true, balance: true } }), // Placeholder query
        []
    );
    const expenseData = await safePrismaCall(
        prisma.account.findMany({ where: { type: 'Expense' }, select: { name: true, balance: true } }), // Placeholder query
        []
    );

    // Return default/empty data if DB connection failed
    if (prismaInitializationFailed) {
         console.warn("Returning empty Profit & Loss data due to database connection failure.");
         return { revenue: [], expenses: [], netProfit: 0, startDate, endDate };
    }

    // Process fetched data (this is simplified)
    revenueTotal = revenueData.reduce((sum, acc) => sum + (acc.balance?.toNumber() ?? 0), 50000); // Example sum + placeholder
    expenseTotal = expenseData.reduce((sum, acc) => sum + (acc.balance?.toNumber() ?? 0), 30000); // Example sum + placeholder

    return {
        revenue: [{ accountName: 'Sales Revenue', total: revenueTotal }], // Replace with actual fetched data mapping
        expenses: [{ accountName: 'Office Supplies', total: 1000 }, { accountName: 'Salaries', total: 29000 }], // Replace with actual fetched data mapping
        netProfit: revenueTotal - expenseTotal,
        startDate,
        endDate,
    };
}

// --- Balance Sheet Report Data ---
export interface BalanceSheetData {
    assets: { accountName: string; balance: number }[];
    liabilities: { accountName: string; balance: number }[];
    equity: { accountName: string; balance: number }[];
    totalAssets: number;
    totalLiabilitiesAndEquity: number;
    asOfDate: Date;
}

export async function getBalanceSheetData(asOfDate: Date): Promise<BalanceSheetData> {
     // Reset flags for this request
     prismaInitializationFailed = false;
     libsslErrorLogged = false;

     console.log(`Generating Balance Sheet as of ${asOfDate.toISOString()}`);
     // 1. Fetch all Asset accounts with their current balance (from Account.balance)
     // 2. Fetch all Liability accounts with their current balance
     // 3. Fetch all Equity accounts with their current balance
     // 4. Sum totals and verify Assets = Liabilities + Equity (should match if bookkeeping is correct)

     const assetsData = await safePrismaCall(prisma.account.findMany({ where: { type: 'Asset', isActive: true }, select: { name: true, balance: true } }), []);
     const liabilitiesData = await safePrismaCall(prisma.account.findMany({ where: { type: 'Liability', isActive: true }, select: { name: true, balance: true } }), []);
     const equityData = await safePrismaCall(prisma.account.findMany({ where: { type: 'Equity', isActive: true }, select: { name: true, balance: true } }), []);

     // Return default/empty data if DB connection failed
     if (prismaInitializationFailed) {
          console.warn("Returning empty Balance Sheet data due to database connection failure.");
          return { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilitiesAndEquity: 0, asOfDate };
     }

     const assets = assetsData.map(a => ({ accountName: a.name, balance: a.balance?.toNumber() ?? 0 }));
     const liabilities = liabilitiesData.map(l => ({ accountName: l.name, balance: l.balance?.toNumber() ?? 0 }));
     const equity = equityData.map(e => ({ accountName: e.name, balance: e.balance?.toNumber() ?? 0 }));


     const totalAssets = assets.reduce((sum, acc) => sum + acc.balance, 0);
     const totalLiabilities = liabilities.reduce((sum, acc) => sum + acc.balance, 0);
     const totalEquity = equity.reduce((sum, acc) => sum + acc.balance, 0);

    return {
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
        asOfDate,
    };
}

// --- Add other report data fetching functions ---
// - Cash Flow Statement
// - A/R Aging
// - A/P Aging
// - Expense by Category/Vendor
// - Etc.

// Example: A/R Aging (Simplified)
export interface ARAgingData {
    clientName: string;
    invoiceNumber: string;
    dueDate: Date;
    total: number;
    daysOverdue: number;
    bucket: 'Current' | '1-30' | '31-60' | '61-90' | '90+';
}

export async function getArAgingData(asOfDate: Date): Promise<ARAgingData[]> {
    // Reset flags for this request
    prismaInitializationFailed = false;
    libsslErrorLogged = false;

    console.log(`Generating A/R Aging as of ${asOfDate.toISOString()}`);
    // 1. Fetch all unpaid/partially paid invoices
    // 2. Calculate days overdue based on dueDate and asOfDate
    // 3. Categorize into buckets

    // Placeholder: Implement actual fetching using safePrismaCall
    const unpaidInvoices = await safePrismaCall(
        prisma.invoice.findMany({
            where: { status: { in: ['Pending', 'Partial', 'Overdue'] } },
            include: { client: { select: { name: true } } }
        }),
        []
    );

    if (prismaInitializationFailed) {
        console.warn("Returning empty A/R Aging data due to database connection failure.");
        return [];
    }


    // Placeholder data processing
    return [
        { clientName: 'Client A', invoiceNumber: 'INV-0010', dueDate: new Date('2024-03-15'), total: 1000, daysOverdue: 45, bucket: '31-60' },
        { clientName: 'Client B', invoiceNumber: 'INV-0011', dueDate: new Date('2024-04-20'), total: 500, daysOverdue: 9, bucket: '1-30' },
        { clientName: 'Client C', invoiceNumber: 'INV-0012', dueDate: new Date('2024-05-10'), total: 2000, daysOverdue: -11, bucket: 'Current' },
    ]; // Replace with actual processing of unpaidInvoices
}

// --- Helper function to handle potential Prisma initialization errors ---
// Wrap your prisma calls within individual try/catch blocks inside report functions
// or create a higher-level function to manage this if needed.
async function safePrismaCall<T>(prismaPromise: Promise<T>, fallback: T): Promise<T> {
    try {
        return await prismaPromise;
    } catch (error) {
        if (checkPrismaInitError(error, 'safePrismaCall')) {
            // Error already logged by checkPrismaInitError
        } else {
            console.error("[REPORT_ERROR] Error executing Prisma call:", error);
        }
        return fallback; // Return fallback data on any error
    }
}
