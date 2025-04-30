
'use server';

import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { endOfMonth, startOfMonth } from 'date-fns';
import { getTenantId } from '@/lib/utils/tenant';
import type { ExpenseSchema } from '@/lib/schemas/expense';
import type { InvoiceSchema } from '@/lib/schemas/invoice';

// Define interfaces matching MongoDB document structures if needed
// e.g., type ExpenseDocument = { ... }

export interface DashboardStats {
  totalExpensesThisMonth: number;
  pendingInvoicesCount: number;
  openExpenseReportsCount: number; // Assuming 'Pending' status means open
  activeAccountsCount: number;
  expenseChangePercent: number | null; // Percentage change from last month
  pendingInvoicesAmount: number;
}

const defaultStats: DashboardStats = {
    totalExpensesThisMonth: 0,
    pendingInvoicesCount: 0,
    openExpenseReportsCount: 0,
    activeAccountsCount: 0,
    expenseChangePercent: null,
    pendingInvoicesAmount: 0,
};

// Helper to get collections
async function getExpensesCollection(): Promise<Collection> {
    const { db } = await connectToDatabase();
    return db.collection('expenses');
}
async function getInvoicesCollection(): Promise<Collection> {
    const { db } = await connectToDatabase();
    return db.collection('invoices');
}
async function getAccountsCollection(): Promise<Collection> {
    const { db } = await connectToDatabase();
    return db.collection('accounts');
}

// Flag to track if *any* DB error occurred during stat calculation
let dbErrorOccurred = false;

// Helper function to log errors and set the flag
function handleDbError(error: unknown, context: string) {
    dbErrorOccurred = true;
    console.error(`[DB_ERROR] Error in ${context}:`, error);
}


// --- Get Dashboard Stats for the current tenant ---
export async function getDashboardStats(): Promise<DashboardStats> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getDashboardStats.");
      return defaultStats; // Return default stats if tenant is not identified
  }

  dbErrorOccurred = false; // Reset flag for this request
  let stats: DashboardStats = { ...defaultStats }; // Start with default stats

  try {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);
    const startOfLastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const endOfLastMonth = endOfMonth(startOfLastMonth);

    const whereTenantClause = { tenantId: tenantId }; // Base clause for filtering by tenant

    const expensesCollection = await getExpensesCollection();
    const invoicesCollection = await getInvoicesCollection();
    const accountsCollection = await getAccountsCollection();

    // Use Promise.allSettled to allow individual queries to fail without stopping others
    const results = await Promise.allSettled([
      // 1. Expenses This Month Aggregate
      expensesCollection.aggregate([
        { $match: { ...whereTenantClause, date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray(),
      // 2. Expenses Last Month Aggregate
      expensesCollection.aggregate([
        { $match: { ...whereTenantClause, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray(),
      // 3. Pending Invoices Count & Amount Aggregate
      invoicesCollection.aggregate([
        { $match: { ...whereTenantClause, status: 'Pending' } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$total" } } }
      ]).toArray(),
      // 4. Open Expense Reports Count (Pending Expenses)
       expensesCollection.countDocuments({ ...whereTenantClause, status: 'Pending' }),
      // 5. Active Accounts Count
      accountsCollection.countDocuments({ ...whereTenantClause, isActive: true }),
    ]);

    // Process results, checking for rejections
    const expensesThisMonthRes = results[0];
    if (expensesThisMonthRes.status === 'fulfilled' && expensesThisMonthRes.value.length > 0) {
        stats.totalExpensesThisMonth = expensesThisMonthRes.value[0].total ?? 0;
    } else if (expensesThisMonthRes.status === 'rejected') {
        handleDbError(expensesThisMonthRes.reason, 'Dashboard Stats (Expenses This Month)');
    }

    const expensesLastMonthRes = results[1];
    let totalExpensesLastMonth = 0;
    if (expensesLastMonthRes.status === 'fulfilled' && expensesLastMonthRes.value.length > 0) {
        totalExpensesLastMonth = expensesLastMonthRes.value[0].total ?? 0;
    } else if (expensesLastMonthRes.status === 'rejected') {
        handleDbError(expensesLastMonthRes.reason, 'Dashboard Stats (Expenses Last Month)');
    }

    const pendingInvoicesRes = results[2];
     if (pendingInvoicesRes.status === 'fulfilled' && pendingInvoicesRes.value.length > 0) {
        stats.pendingInvoicesCount = pendingInvoicesRes.value[0].count ?? 0;
        stats.pendingInvoicesAmount = pendingInvoicesRes.value[0].totalAmount ?? 0;
     } else if (pendingInvoicesRes.status === 'rejected') {
        handleDbError(pendingInvoicesRes.reason, 'Dashboard Stats (Pending Invoices)');
     }

     const openExpensesRes = results[3];
     if (openExpensesRes.status === 'fulfilled') {
         stats.openExpenseReportsCount = openExpensesRes.value ?? 0;
     } else if (openExpensesRes.status === 'rejected') {
        handleDbError(openExpensesRes.reason, 'Dashboard Stats (Open Expenses Count)');
     }

    const accountsCountRes = results[4];
    if (accountsCountRes.status === 'fulfilled') {
        stats.activeAccountsCount = accountsCountRes.value ?? 0;
    } else if (accountsCountRes.status === 'rejected') {
        handleDbError(accountsCountRes.reason, 'Dashboard Stats (Active Accounts Count)');
    }

     // Calculate percentage change only if both values were successfully fetched
     if (expensesThisMonthRes.status === 'fulfilled' && expensesLastMonthRes.status === 'fulfilled') {
         if (totalExpensesLastMonth > 0) {
             stats.expenseChangePercent = ((stats.totalExpensesThisMonth - totalExpensesLastMonth) / totalExpensesLastMonth) * 100;
         } else if (stats.totalExpensesThisMonth > 0) {
             stats.expenseChangePercent = 100; // Indicate growth if last month was 0
         } // else remains null if both are 0
     }

    // If any DB error occurred, log a warning
    if (dbErrorOccurred) {
        console.warn(`[DB_WARN] One or more database errors occurred while calculating dashboard stats for tenant ${tenantId}. Stats may be incomplete.`);
    }

    return stats;

  } catch (error) {
     // Catch any unexpected top-level errors (less likely with Promise.allSettled)
     console.error(`[ACTION_ERROR] Unexpected top-level error in getDashboardStats (Tenant: ${tenantId}):`, error);
     console.warn(`[DB_WARN] Unexpected error fetching dashboard stats for tenant ${tenantId}. Returning default stats.`);
     return defaultStats; // Return defaults on any top-level error
  }
}

// --- Fetch Recent Data (scoped by tenant) ---

// Define interfaces for the shape of data returned, including relations
interface RecentExpense extends Omit<ExpenseSchema, 'account' | 'id'> {
    _id: ObjectId;
    id?: string; // Add string id after conversion
    account: { name: string }; // Only include needed fields
}
interface RecentInvoice extends Omit<InvoiceSchema, 'client' | 'id'> {
     _id: ObjectId;
     id?: string; // Add string id after conversion
     client: { name: string }; // Only include needed fields
}

export async function getRecentExpenses(limit = 5): Promise<Omit<RecentExpense,'_id'>[]> {
    const tenantId = await getTenantId();
    if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getRecentExpenses.");
      return [];
    }
    const context = `getRecentExpenses (Tenant: ${tenantId})`;

   try {
     const expensesCollection = await getExpensesCollection();
     // Use aggregation to join with accounts and select only the name
     const expensesCursor = expensesCollection.aggregate([
         { $match: { tenantId: tenantId } },
         { $sort: { date: -1 } },
         { $limit: limit },
         {
             $lookup: {
                 from: 'accounts',
                 localField: 'accountId',
                 foreignField: '_id',
                 as: 'accountInfo'
             }
         },
         { $unwind: { path: '$accountInfo', preserveNullAndEmptyArrays: true } }, // Keep expense even if account lookup fails
         {
             $project: { // Reshape the output document
                 _id: 1,
                 date: 1,
                 amount: 1,
                 description: 1,
                 status: 1,
                 // etc. - include other necessary fields from ExpenseSchema
                 'account.name': '$accountInfo.name' // Project nested account name
             }
         }
     ]);

     const expensesArray = await expensesCursor.toArray() as RecentExpense[];

     // Map MongoDB document to desired return structure
     return expensesArray.map(exp => ({
         ...exp,
         id: exp._id.toHexString(), // Convert ObjectId to string id
         // Ensure account exists before accessing name
         account: exp.account ? { name: exp.account.name } : { name: 'Unknown Account' },
     }));
   } catch (error) {
       handleDbError(error, context);
       console.warn(`[DB_WARN] Returning empty recent expenses list for tenant ${tenantId} due to unexpected error.`);
       return []; // Return empty array on any error
   }
}

export async function getRecentInvoices(limit = 5): Promise<Omit<RecentInvoice, '_id'>[]> {
    const tenantId = await getTenantId();
    if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getRecentInvoices.");
      return [];
    }
    const context = `getRecentInvoices (Tenant: ${tenantId})`;

   try {
     const invoicesCollection = await getInvoicesCollection();
      // Use aggregation to join with clients and select only the name
     const invoicesCursor = invoicesCollection.aggregate([
         { $match: { tenantId: tenantId } },
         { $sort: { issueDate: -1 } },
         { $limit: limit },
          {
             $lookup: {
                 from: 'clients',
                 localField: 'clientId',
                 foreignField: '_id',
                 as: 'clientInfo'
             }
         },
         { $unwind: { path: '$clientInfo', preserveNullAndEmptyArrays: true } },
         {
             $project: {
                 _id: 1,
                 invoiceNumber: 1,
                 status: 1,
                 total: 1,
                 issueDate: 1,
                 dueDate: 1,
                 // etc. - include other necessary fields from InvoiceSchema
                 'client.name': '$clientInfo.name'
             }
         }
     ]);
      const invoicesArray = await invoicesCursor.toArray() as RecentInvoice[];

      // Map MongoDB document to desired return structure
     return invoicesArray.map(inv => ({
        ...inv,
        id: inv._id.toHexString(), // Convert ObjectId to string id
         client: inv.client ? { name: inv.client.name } : { name: 'Unknown Client' },
    }));
   } catch (error) {
       handleDbError(error, context);
       console.warn(`[DB_WARN] Returning empty recent invoices list for tenant ${tenantId} due to unexpected error.`);
      return []; // Return empty array on any error
   }
}
