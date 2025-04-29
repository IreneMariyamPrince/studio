
'use server';

import prisma from '@/lib/prisma';
import { endOfMonth, startOfMonth } from 'date-fns';
import { Prisma } from '@prisma/client'; // Import Prisma namespace

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

export async function getDashboardStats(): Promise<DashboardStats> {
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

    // Process results safely
    const expensesThisMonthRes = results[0];
    const expensesLastMonthRes = results[1];
    const pendingInvoicesRes = results[2];
    const openExpensesRes = results[3];
    const accountsCountRes = results[4];

    // Handle potential Prisma Initialization errors from any query
    for (const result of results) {
        if (result.status === 'rejected' && result.reason instanceof Prisma.PrismaClientInitializationError) {
            console.error("[ACTION_ERROR] Prisma Initialization Error fetching dashboard stats subset:", result.reason.message);
            if (result.reason.message.includes('libssl')) {
                console.error("This might be due to missing system libraries like 'libssl'. Please check the environment configuration.");
            }
            // Return default stats to prevent breaking UI completely if any sub-query fails due to DB connection
            return defaultStats;
        } else if (result.status === 'rejected') {
            // Log other errors but potentially continue if possible
            console.error("[ACTION_ERROR] Error fetching dashboard data subset:", result.reason);
        }
    }

    // Calculate stats from successful results, default to 0 if a query failed for other reasons
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
    // Check if error is Prisma Initialization Error (although handled above, good for robustness)
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error("[ACTION_ERROR] Top-Level Prisma Initialization Error fetching dashboard stats:", error.message);
         if (error.message.includes('libssl')) {
           console.error("This might be due to missing system libraries like 'libssl'. Please check the environment configuration.");
         }
     } else {
         console.error("Unexpected error fetching dashboard stats:", error);
     }
    return defaultStats;
  }
}

// --- Fetch Recent Data (Optional helpers for dashboard lists) ---

export async function getRecentExpenses(limit = 5) {
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
      if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error("[ACTION_ERROR] Prisma Initialization Error fetching recent expenses:", error.message);
             if (error.message.includes('libssl')) {
                 console.error("Check 'libssl' dependency.");
             }
             // Return empty array to prevent breaking UI completely
             return [];
       }
      console.error("Error fetching recent expenses:", error);
      return [];
   }
}

export async function getRecentInvoices(limit = 5) {
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
       if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error("[ACTION_ERROR] Prisma Initialization Error fetching recent invoices:", error.message);
             if (error.message.includes('libssl')) {
                 console.error("Check 'libssl' dependency.");
             }
             // Return empty array to prevent breaking UI completely
             return [];
       }
      console.error("Error fetching recent invoices:", error);
      return [];
   }
}
