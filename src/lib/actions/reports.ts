
'use server';

import { Collection, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Helper to get collections
async function getJournalEntryLinesCollection(): Promise<Collection<any>> { // Define specific type if needed
  const { db } = await connectToDatabase();
  return db.collection('journalEntryLines');
}
async function getAccountsCollection(): Promise<Collection<any>> {
  const { db } = await connectToDatabase();
  return db.collection('accounts');
}
async function getInvoicesCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('invoices');
}
async function getPaymentsCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('payments');
}


// Helper to safely execute MongoDB calls and handle errors
async function safeMongoCall<T>(mongoPromise: Promise<T>, fallback: T, tenantId: string | null, context: string): Promise<T> {
    if (!tenantId) {
        console.error(`[ACTION_ERROR] Tenant ID missing in ${context}.`);
        return fallback;
    }
    try {
        return await mongoPromise;
    } catch (error) {
        console.error(`[REPORT_ERROR] Error executing MongoDB call in ${context} for tenant ${tenantId}:`, error);
        console.warn(`[DB_WARN] Returning fallback data for ${context} for tenant ${tenantId} due to unexpected error.`);
        return fallback;
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
    const context = `getProfitLossData (Tenant: ${tenantId})`;

    try {
        const journalLinesCollection = await getJournalEntryLinesCollection();

        // Aggregate directly on lines, joining account info
        const aggregationPipeline = [
          { // Match lines within date range (requires entryDate on lines or joining entries first)
            // Assuming we join JournalEntry to get the date:
            $lookup: { from: 'journalEntries', localField: 'journalEntryId', foreignField: '_id', as: 'entryInfo' }
          },
          { $unwind: '$entryInfo' },
          { $match: { 'entryInfo.tenantId': tenantId, 'entryInfo.entryDate': { $gte: startDate, $lte: endDate } } },
          { // Join account info
            $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'accountDetails' }
          },
          { $unwind: '$accountDetails' },
          { // Filter for Revenue & Expense accounts
            $match: { 'accountDetails.tenantId': tenantId, 'accountDetails.type': { $in: ['Revenue', 'Expense'] } }
          },
          { // Group by account to calculate net change
            $group: {
              _id: '$accountId',
              accountName: { $first: '$accountDetails.name' },
              accountType: { $first: '$accountDetails.type' },
              totalDebits: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
              totalCredits: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } }
            }
          }
        ];


        const results = await safeMongoCall(journalLinesCollection.aggregate(aggregationPipeline).toArray(), [], tenantId, context);


        let totalRevenue = 0;
        let totalExpenses = 0;
        const revenueBreakdown: ProfitLossData['revenue'] = [];
        const expenseBreakdown: ProfitLossData['expenses'] = [];

        results.forEach((res: any) => {
            let netChange = 0;
             // Revenue increases with Credits, decreases with Debits (Normal Credit Balance)
            if (res.accountType === 'Revenue') {
                netChange = res.totalCredits - res.totalDebits;
                totalRevenue += netChange;
                revenueBreakdown.push({ accountId: res._id.toHexString(), accountName: res.accountName, total: netChange });
            }
             // Expenses increase with Debits, decrease with Credits (Normal Debit Balance)
            else if (res.accountType === 'Expense') {
                netChange = res.totalDebits - res.totalCredits;
                totalExpenses += netChange;
                expenseBreakdown.push({ accountId: res._id.toHexString(), accountName: res.accountName, total: netChange });
            }
        });


        return {
            revenue: revenueBreakdown,
            expenses: expenseBreakdown,
            netProfit: totalRevenue - totalExpenses, // Revenue is typically positive, expenses positive
            startDate,
            endDate,
        };
    } catch (error) {
         // This catch block might be redundant if safeMongoCall handles it, but good for safety.
         console.error(`[REPORT_ERROR] Top-level error in ${context}:`, error);
         return fallbackData;
    }
}

// --- Balance Sheet Report Data ---
export interface BalanceSheetData {
    assets: { accountId: string; accountName: string; balance: number }[];
    liabilities: { accountId: string; accountName: string; balance: number }[];
    equity: { accountId: string; accountName: string; balance: number }[];
    totalAssets: number;
    totalLiabilitiesAndEquity: number;
    asOfDate: Date; // Balance sheet is a snapshot at a point in time
}

export async function getBalanceSheetData(asOfDate: Date): Promise<BalanceSheetData> {
     const tenantId = await getTenantId();
     const fallbackData: BalanceSheetData = { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilitiesAndEquity: 0, asOfDate };
     if (!tenantId) return fallbackData;

     console.log(`Generating Balance Sheet as of ${asOfDate.toISOString()} for Tenant: ${tenantId}`);
     const context = `getBalanceSheetData (Tenant: ${tenantId})`;

     // Fetch accounts directly - balance should be accurate as of the latest transaction
     const accountsCollection = await getAccountsCollection();
     const accountsData = await safeMongoCall(
         accountsCollection.find({
             tenantId: tenantId,
             isActive: true,
             type: { $in: ['Asset', 'Liability', 'Equity'] }
         }, {
             projection: { _id: 1, name: 1, type: 1, balance: 1 }
         }).toArray(),
         [], tenantId, context
     );

     const assets: BalanceSheetData['assets'] = [];
     const liabilities: BalanceSheetData['liabilities'] = [];
     const equity: BalanceSheetData['equity'] = [];

     accountsData.forEach(acc => {
         const balance = acc.balance ?? 0; // Default to 0 if balance is null/undefined
         const accountDetail = { accountId: acc._id.toHexString(), accountName: acc.name, balance: balance };
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
    amountDue: number;
    daysOverdue: number;
    bucket: 'Current' | '1-30' | '31-60' | '61-90' | '90+';
}

export async function getArAgingData(asOfDate: Date): Promise<ARAgingData[]> {
    const tenantId = await getTenantId();
    if (!tenantId) return [];
    const context = `getArAgingData (Tenant: ${tenantId})`;

    console.log(`Generating A/R Aging as of ${asOfDate.toISOString()} for Tenant: ${tenantId}`);

    const invoicesCollection = await getInvoicesCollection();
    const paymentsCollection = await getPaymentsCollection();

    // 1. Find unpaid/partially paid invoices
    const unpaidInvoicesCursor = invoicesCollection.aggregate([
        { $match: { tenantId: tenantId, status: { $in: ['Pending', 'Partial', 'Overdue'] } } },
         { // Join client info
             $lookup: { from: 'clients', localField: 'clientId', foreignField: '_id', as: 'clientInfo' }
         },
         { $unwind: '$clientInfo' },
         { // Project needed fields before payment lookup
             $project: {
                 _id: 1, invoiceNumber: 1, dueDate: 1, total: 1, status: 1,
                 clientId: 1, clientName: '$clientInfo.name'
             }
         }
    ]);
    const unpaidInvoices = await safeMongoCall(unpaidInvoicesCursor.toArray(), [], tenantId, `${context} - Invoice Fetch`);

    const agingData: ARAgingData[] = [];
    const todayTime = asOfDate.getTime();

    // 2. For each unpaid invoice, calculate total payments
    for (const invoice of unpaidInvoices) {
        const invoiceId = invoice._id;
        const payments = await safeMongoCall(
            paymentsCollection.find({ invoiceId: invoiceId, tenantId: tenantId }, { projection: { amount: 1 } }).toArray(),
            [], tenantId, `${context} - Payment Fetch for Invoice ${invoiceId}`
        );

        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const amountDue = invoice.total - totalPaid;

        if (amountDue <= 0.005) continue; // Skip if effectively paid

        const dueDateTime = new Date(invoice.dueDate).getTime(); // Ensure it's a Date object
        const diffTime = todayTime - dueDateTime;
        const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        let bucket: ARAgingData['bucket'];
        if (diffTime <= 0) bucket = 'Current';
        else if (diffDays <= 30) bucket = '1-30';
        else if (diffDays <= 60) bucket = '31-60';
        else if (diffDays <= 90) bucket = '61-90';
        else bucket = '90+';

        agingData.push({
            clientId: invoice.clientId.toHexString(),
            clientName: invoice.clientName,
            invoiceId: invoiceId.toHexString(),
            invoiceNumber: invoice.invoiceNumber || `INV-${invoiceId.toHexString().substring(0,4)}`,
            dueDate: new Date(invoice.dueDate),
            invoiceTotal: invoice.total,
            amountDue: amountDue,
            daysOverdue: diffDays > 0 ? diffDays : 0,
            bucket: bucket,
        });
    }

    return agingData.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// --- Add other report data fetching functions as needed ---
// - Cash Flow Statement
// - A/P Aging
// - Expense by Category/Vendor
// - Budget vs. Actuals
