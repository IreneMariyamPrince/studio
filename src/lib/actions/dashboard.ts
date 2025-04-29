
'use server';

import prisma from '@/lib/prisma';
import { endOfMonth, startOfMonth } from 'date-fns';
import { Prisma } from '@prisma/client'; // Ensure Prisma namespace is imported
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

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

// Helper function to check and log Prisma init errors (assume it exists)
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Handle libssl error message specifically if needed
         return true;
     }
     return false;
}

// --- Get Dashboard Stats for the current tenant ---
export async function getDashboardStats(): Promise<DashboardStats> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getDashboardStats.");
      return defaultStats; // Return default stats if tenant is not identified
  }

  let initializationErrorOccurred = false; // Track if any critical DB error happened

  try {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);
    const startOfLastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const endOfLastMonth = endOfMonth(startOfLastMonth);

    const whereTenantClause = { tenantId: tenantId }; // Base clause for filtering by tenant

    // Use Promise.allSettled to handle potential errors in individual queries gracefully
    const results = await Promise.allSettled([
      // 1. Expenses This Month
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { ...whereTenantClause, date: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
      }),
      // 2. Expenses Last Month
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { ...whereTenantClause, date: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
      // 3. Pending Invoices Count & Amount
      prisma.invoice.aggregate({
        _count: { id: true },
        _sum: { total: true },
        where: { ...whereTenantClause, status: 'Pending' },
      }),
      // 4. Open Expense Reports Count
      prisma.expense.aggregate({
        _count: { id: true },
        where: { ...whereTenantClause, status: 'Pending' },
      }),
      // 5. Active Accounts Count
      prisma.account.count({ where: { ...whereTenantClause, isActive: true }}), // Count only active accounts for this tenant
    ]);

    // Check each result for Prisma initialization errors
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const context = `getDashboardStats query ${index + 1} (Tenant: ${tenantId})`;
             if (checkPrismaInitError(result.reason, context)) {
                 initializationErrorOccurred = true; // Mark that a critical error occurred
                  // Specific logging for libssl is handled within checkPrismaInitError
             } else {
                 // Log other non-initialization errors
                 console.error(`[ACTION_ERROR] Error in ${context}:`, result.reason);
             }
        }
    });

     // If a critical DB connection error occurred in *any* of the queries, return defaults.
     if (initializationErrorOccurred) {
         console.warn(`Returning default dashboard stats for tenant ${tenantId} due to database connection failure.`);
         return defaultStats;
     }

    // Calculate stats from successful results, default to 0 if a query failed for other reasons
    const expensesThisMonthRes = results[0];
    const expensesLastMonthRes = results[1];
    const pendingInvoicesRes = results[2];
    const openExpensesRes = results[3];
    const accountsCountRes = results[4];

    const totalExpensesThisMonth = expensesThisMonthRes.status === 'fulfilled' ? expensesThisMonthRes.value._sum.amount?.toNumber() ?? 0 : 0;
    const totalExpensesLastMonth = expensesLastMonthRes.status === 'fulfilled' ? expensesLastMonthRes.value._sum.amount?.toNumber() ?? 0 : 0;
    const pendingInvoicesCount = pendingInvoicesRes.status === 'fulfilled' ? pendingInvoicesRes.value._count.id ?? 0 : 0;
    const pendingInvoicesAmount = pendingInvoicesRes.status === 'fulfilled' ? pendingInvoicesRes.value._sum.total?.toNumber() ?? 0 : 0;
    const openExpenseReportsCount = openExpensesRes.status === 'fulfilled' ? openExpensesRes.value._count.id ?? 0 : 0;
    const activeAccountsCount = accountsCountRes.status === 'fulfilled' ? accountsCountRes.value ?? 0 : 0;


     // Calculate percentage change
     let expenseChangePercent: number | null = null;
     if (totalExpensesLastMonth > 0) {
       expenseChangePercent = ((totalExpensesThisMonth - totalExpensesLastMonth) / totalExpensesLastMonth) * 100;
     } else if (totalExpensesThisMonth > 0) {
        expenseChangePercent = 100; // Indicate high growth if last month was 0
     } // else remains null if both are 0


    return {
      totalExpensesThisMonth,
      pendingInvoicesCount,
      openExpenseReportsCount,
      activeAccountsCount,
      expenseChangePercent,
      pendingInvoicesAmount,
    };
  } catch (error) {
     // Catch any unexpected top-level errors (less likely with Promise.allSettled)
     const context = `getDashboardStats top-level (Tenant: ${tenantId})`;
     if (checkPrismaInitError(error, context)) {
          console.warn(`Returning default dashboard stats for tenant ${tenantId} due to top-level database connection failure.`);
     } else {
         console.error(`Unexpected error fetching dashboard stats for tenant ${tenantId}:`, error);
         console.warn(`Returning default dashboard stats for tenant ${tenantId} due to unexpected error.`);
     }
     return defaultStats;
  }
}

// --- Fetch Recent Data (scoped by tenant) ---

export async function getRecentExpenses(limit = 5) {
    const tenantId = await getTenantId();
    if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getRecentExpenses.");
      return [];
    }
    const context = `getRecentExpenses (Tenant: ${tenantId})`;

   try {
     const expenses = await prisma.expense.findMany({
       take: limit,
       where: { tenantId: tenantId }, // Filter by tenant
       orderBy: { date: 'desc' },
       include: { account: { select: { name: true } } }, // Include account name
     });
     // Parse Decimal to number for amount
     return expenses.map(exp => ({
         ...exp,
         amount: exp.amount.toNumber()
     }));
   } catch (error) {
       if (checkPrismaInitError(error, context)) {
            console.warn(`Returning empty recent expenses for tenant ${tenantId} due to DB connection issue.`);
        } else {
             console.error(`[ACTION_ERROR] Error fetching recent expenses for tenant ${tenantId}:`, error);
       }
       return []; // Return empty array on any error
   }
}

export async function getRecentInvoices(limit = 5) {
    const tenantId = await getTenantId();
    if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getRecentInvoices.");
      return [];
    }
    const context = `getRecentInvoices (Tenant: ${tenantId})`;

   try {
     const invoices = await prisma.invoice.findMany({
       take: limit,
       where: { tenantId: tenantId }, // Filter by tenant
       orderBy: { issueDate: 'desc' },
       include: { client: { select: { name: true } } }, // Include client name
     });
      // Parse Decimal to number for total
     return invoices.map(inv => ({
        ...inv,
        total: inv.total.toNumber()
    }));
   } catch (error) {
       if (checkPrismaInitError(error, context)) {
             console.warn(`Returning empty recent invoices for tenant ${tenantId} due to DB connection issue.`);
        } else {
             console.error(`[ACTION_ERROR] Error fetching recent invoices for tenant ${tenantId}:`, error);
       }
      return []; // Return empty array on any error
   }
}
