'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';

// --- Profit & Loss Report Data ---
export interface ProfitLossData {
    revenue: { accountName: string; total: number }[];
    expenses: { accountName: string; total: number }[];
    netProfit: number;
    startDate: Date;
    endDate: Date;
}

export async function getProfitLossData(startDate: Date, endDate: Date): Promise<ProfitLossData> {
    console.log(`Generating P&L from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    // Placeholder implementation
    // 1. Fetch sum of amounts for all Revenue accounts within the date range (using Journal Entries or simplified logic)
    // 2. Fetch sum of amounts for all Expense accounts within the date range (using Journal Entries or Expense records)
    // 3. Calculate Net Profit

    const revenueTotal = 50000; // Placeholder
    const expenseTotal = 30000; // Placeholder

    return {
        revenue: [{ accountName: 'Sales Revenue', total: revenueTotal }], // Replace with actual fetched data
        expenses: [{ accountName: 'Office Supplies', total: 1000 }, { accountName: 'Salaries', total: 29000 }], // Replace with actual fetched data
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
     console.log(`Generating Balance Sheet as of ${asOfDate.toISOString()}`);
     // 1. Fetch all Asset accounts with their current balance (from Account.balance)
     // 2. Fetch all Liability accounts with their current balance
     // 3. Fetch all Equity accounts with their current balance
     // 4. Sum totals and verify Assets = Liabilities + Equity (should match if bookkeeping is correct)

     const assets = [{ accountName: 'Cash', balance: 15000 }, { accountName: 'Accounts Receivable', balance: 5000 }]; // Placeholder
     const liabilities = [{ accountName: 'Accounts Payable', balance: 3000 }]; // Placeholder
     const equity = [{ accountName: 'Retained Earnings', balance: 17000 }]; // Placeholder

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

export async function getArAgingData(asOfDate: Date): Promise<ArAgingData[]> {
    console.log(`Generating A/R Aging as of ${asOfDate.toISOString()}`);
    // 1. Fetch all unpaid/partially paid invoices
    // 2. Calculate days overdue based on dueDate and asOfDate
    // 3. Categorize into buckets

    // Placeholder data
    return [
        { clientName: 'Client A', invoiceNumber: 'INV-0010', dueDate: new Date('2024-03-15'), total: 1000, daysOverdue: 45, bucket: '31-60' },
        { clientName: 'Client B', invoiceNumber: 'INV-0011', dueDate: new Date('2024-04-20'), total: 500, daysOverdue: 9, bucket: '1-30' },
        { clientName: 'Client C', invoiceNumber: 'INV-0012', dueDate: new Date('2024-05-10'), total: 2000, daysOverdue: -11, bucket: 'Current' },
    ];
}

// --- Helper function to handle potential Prisma initialization errors ---
// Wrap your prisma calls within individual try/catch blocks inside report functions
// or create a higher-level function to manage this if needed.
// Example:
async function safePrismaCall<T>(prismaPromise: Promise<T>, fallback: T): Promise<T> {
    try {
        return await prismaPromise;
    } catch (error) {
        if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error("[REPORT_ERROR] Prisma Initialization Error:", error.message);
            console.error("Database connection failed while generating report data.");
            // Potentially throw a specific error or return fallback data
        } else {
            console.error("[REPORT_ERROR] Error fetching report data:", error);
        }
        return fallback; // Return fallback data on error
    }
}

// Example usage within a report function:
// const assets = await safePrismaCall(
//     prisma.account.findMany({ where: { type: 'Asset', isActive: true } }),
//     [] // Fallback empty array
// );
