
'use server';

import prisma from '@/lib/prisma';
import { endOfMonth, startOfMonth } from 'date-fns';
import { Prisma } from '@prisma/client'; // Ensure Prisma namespace is imported

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

// Centralized flag to track if a critical init error occurred during the current request cycle
let prismaInitializationFailed = false;
let libsslErrorLogged = false; // Flag to log libssl error only once per request cycle

// Helper function to check and log Prisma init errors
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         prismaInitializationFailed = true; // Set the flag for the current request
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging for this request
         } else if (!error.message.includes('libssl')) {
             // Log general initialization errors that are not libssl related
             console.error(`DATABASE CONNECTION FAILED (${context}): Prisma failed to initialize. Check database connection details and server logs.`);
         }
         return true; // Indicate an init error occurred
     }
     return false; // Not an init error
}


export async function getDashboardStats(): Promise<DashboardStats> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  try {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);
    const startOfLastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const endOfLastMonth = endOfMonth(startOfLastMonth);

    // Use Promise.allSettled to handle potential errors in individual queries gracefully
    const results = await Promise.allSettled([
      // 1. Expenses This Month
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { date: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
      }),
      // 2. Expenses Last Month
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { date: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
      // 3. Pending Invoices Count & Amount
      prisma.invoice.aggregate({
        _count: { id: true },
        _sum: { total: true },
        where: { status: 'Pending' },
      }),
      // 4. Open Expense Reports Count
      prisma.expense.aggregate({
        _count: { id: true },
        where: { status: 'Pending' },
      }),
      // 5. Active Accounts Count
      prisma.account.count({ where: { isActive: true }}), // Count only active accounts
    ]);

    // Check each result for Prisma initialization errors
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
             // Use the helper to check and log the error appropriately
             // No need to set initializationErrorOccurred flag here, checkPrismaInitError does it
            checkPrismaInitError(result.reason, `getDashboardStats query ${index + 1}`);
        }
    });

     // If a critical DB connection error occurred in *any* of the queries, return defaults immediately.
     if (prismaInitializationFailed) {
         console.warn("Returning default dashboard stats due to database connection failure.");
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
        expenseChangePercent = 100; // Indicate infinite growth if last month was 0
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
     // Check if it's an initialization error that wasn't caught in the loop (unlikely but safe)
     if (checkPrismaInitError(error, 'getDashboardStats top-level')) {
         console.warn("Returning default dashboard stats due to top-level database connection failure.");
     } else {
         console.error("Unexpected error fetching dashboard stats:", error);
         console.warn("Returning default dashboard stats due to unexpected error.");
     }
     return defaultStats;
  }
}

// --- Fetch Recent Data (Optional helpers for dashboard lists) ---

export async function getRecentExpenses(limit = 5) {
   // Reset flags for this request (though might inherit from parent if called sequentially)
   // It's safer to rely on the checkPrismaInitError flags set within this request context
   // prismaInitializationFailed = false;
   // libsslErrorLogged = false;

   try {
     const expenses = await prisma.expense.findMany({
       take: limit,
       orderBy: { date: 'desc' },
       include: { account: { select: { name: true } } }, // Include account name
     });
     // Parse Decimal to number for amount
     return expenses.map(exp => ({
         ...exp,
         amount: exp.amount.toNumber()
     }));
   } catch (error) {
       if (checkPrismaInitError(error, 'getRecentExpenses')) {
            console.warn("Returning empty recent expenses list due to database connection failure.");
        } else {
            // Log other errors if necessary
            console.error("[ACTION_ERROR] Error fetching recent expenses:", error);
       }
       return []; // Return empty array on any error
   }
}

export async function getRecentInvoices(limit = 5) {
   // Reset flags for this request context
   // prismaInitializationFailed = false;
   // libsslErrorLogged = false;

   try {
     const invoices = await prisma.invoice.findMany({
       take: limit,
       orderBy: { issueDate: 'desc' },
       include: { client: { select: { name: true } } }, // Include client name
     });
      // Parse Decimal to number for total
     return invoices.map(inv => ({
        ...inv,
        total: inv.total.toNumber()
    }));
   } catch (error) {
       if (checkPrismaInitError(error, 'getRecentInvoices')) {
             console.warn("Returning empty recent invoices list due to database connection failure.");
        } else {
            // Log other errors if necessary
             console.error("[ACTION_ERROR] Error fetching recent invoices:", error);
       }
      return []; // Return empty array on any error
   }
}
