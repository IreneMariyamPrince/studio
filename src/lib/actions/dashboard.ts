
'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client'; // Ensure Prisma namespace is imported
import { endOfMonth, startOfMonth } from 'date-fns';
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

// Flag to prevent spamming the console with the same libssl error
let libsslErrorLogged = false;
let prismaInitializationFailed = false; // Flag to track if *any* init error occurred

// Helper function to check and log Prisma init errors
// Returns true if it WAS an initialization error, false otherwise
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         prismaInitializationFailed = true; // Set the global flag
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message); // Log the specific context and message
         // Log the more detailed environment message only once
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 or 3 (check Prisma version compatibility) is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging of the detailed message
         }
         return true; // Indicate that it was an initialization error
     }
     return false; // Not an initialization error
}

// --- Get Dashboard Stats for the current tenant ---
export async function getDashboardStats(): Promise<DashboardStats> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getDashboardStats.");
      return defaultStats; // Return default stats if tenant is not identified
  }

  // Reset flags for this request
  prismaInitializationFailed = false;
  // libsslErrorLogged can stay true once logged for the lifetime of the server process

  let stats: DashboardStats = { ...defaultStats }; // Start with default stats

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

    // Check each result for Prisma initialization errors *after* all promises settle
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const context = `getDashboardStats query ${index + 1} (Tenant: ${tenantId})`;
            // Use the helper to check and log appropriately
            const isInitError = checkPrismaInitError(result.reason, context);
            if (!isInitError) {
                 // Log other non-initialization errors
                 console.error(`[ACTION_ERROR] Error in ${context}:`, result.reason);
            }
        }
    });

     // If a critical DB connection error occurred in *any* of the queries, log a warning and return defaults.
     if (prismaInitializationFailed) {
         console.warn(`[DB_WARN] Database connection failed during dashboard stat calculation for tenant ${tenantId}. Returning default stats.`);
         return defaultStats;
     }

    // Calculate stats from successful results, default to 0 if a query failed for other reasons
    const expensesThisMonthRes = results[0];
    const expensesLastMonthRes = results[1];
    const pendingInvoicesRes = results[2];
    const openExpensesRes = results[3];
    const accountsCountRes = results[4];

    stats.totalExpensesThisMonth = expensesThisMonthRes.status === 'fulfilled' ? expensesThisMonthRes.value._sum.amount?.toNumber() ?? 0 : 0;
    const totalExpensesLastMonth = expensesLastMonthRes.status === 'fulfilled' ? expensesLastMonthRes.value._sum.amount?.toNumber() ?? 0 : 0;
    stats.pendingInvoicesCount = pendingInvoicesRes.status === 'fulfilled' ? pendingInvoicesRes.value._count.id ?? 0 : 0;
    stats.pendingInvoicesAmount = pendingInvoicesRes.status === 'fulfilled' ? pendingInvoicesRes.value._sum.total?.toNumber() ?? 0 : 0;
    stats.openExpenseReportsCount = openExpensesRes.status === 'fulfilled' ? openExpensesRes.value._count.id ?? 0 : 0;
    stats.activeAccountsCount = accountsCountRes.status === 'fulfilled' ? accountsCountRes.value ?? 0 : 0;

     // Calculate percentage change
     let expenseChangePercent: number | null = null;
     if (totalExpensesLastMonth > 0) {
       expenseChangePercent = ((stats.totalExpensesThisMonth - totalExpensesLastMonth) / totalExpensesLastMonth) * 100;
     } else if (stats.totalExpensesThisMonth > 0) {
        expenseChangePercent = 100; // Indicate high growth if last month was 0
     } // else remains null if both are 0
    stats.expenseChangePercent = expenseChangePercent;

    return stats;

  } catch (error) {
     // Catch any unexpected top-level errors (less likely with Promise.allSettled)
     const context = `getDashboardStats top-level (Tenant: ${tenantId})`;
     if (!checkPrismaInitError(error, context)) {
         // Log errors that are not init errors
         console.error(`[ACTION_ERROR] Unexpected top-level error in ${context}:`, error);
     }
     console.warn(`[DB_WARN] Unexpected error fetching dashboard stats for tenant ${tenantId}. Returning default stats.`);
     return defaultStats; // Return defaults on any top-level error
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
        if(checkPrismaInitError(error, context)) {
            console.warn(`[DB_WARN] Database connection failed while fetching recent expenses for tenant ${tenantId}. Returning empty list.`);
        } else {
             console.error(`[ACTION_ERROR] Error fetching recent expenses for tenant ${tenantId}:`, error);
             console.warn(`[DB_WARN] Returning empty recent expenses list for tenant ${tenantId} due to unexpected error.`);
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
        if(checkPrismaInitError(error, context)) {
            console.warn(`[DB_WARN] Database connection failed while fetching recent invoices for tenant ${tenantId}. Returning empty list.`);
        } else {
            console.error(`[ACTION_ERROR] Error fetching recent invoices for tenant ${tenantId}:`, error);
             console.warn(`[DB_WARN] Returning empty recent invoices list for tenant ${tenantId} due to unexpected error.`);
       }
      return []; // Return empty array on any error
   }
}
