
'use server';

import prisma from '@/lib/prisma';
import { endOfMonth, startOfMonth } from 'date-fns';

export interface DashboardStats {
  totalExpensesThisMonth: number;
  pendingInvoicesCount: number;
  openExpenseReportsCount: number; // Assuming 'Pending' status means open
  activeAccountsCount: number;
  expenseChangePercent: number | null; // Percentage change from last month
  pendingInvoicesAmount: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);
    const startOfLastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const endOfLastMonth = endOfMonth(startOfLastMonth);

    // 1. Total Expenses This Month
    const expensesThisMonth = await prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        date: {
          gte: startOfCurrentMonth,
          lte: endOfCurrentMonth,
        },
        // Optionally filter by status: status: 'Approved'
      },
    });
    const totalExpensesThisMonth = expensesThisMonth._sum.amount ?? 0;

     // Expenses Last Month (for comparison)
     const expensesLastMonth = await prisma.expense.aggregate({
       _sum: { amount: true },
       where: {
         date: {
           gte: startOfLastMonth,
           lte: endOfLastMonth,
         },
          // status: 'Approved'
       },
     });
     const totalExpensesLastMonth = expensesLastMonth._sum.amount ?? 0;

     // Calculate percentage change
     let expenseChangePercent: number | null = null;
     if (totalExpensesLastMonth > 0) {
       expenseChangePercent = ((totalExpensesThisMonth - totalExpensesLastMonth) / totalExpensesLastMonth) * 100;
     } else if (totalExpensesThisMonth > 0) {
        expenseChangePercent = 100; // Indicate infinite growth if last month was 0
     } // else remains null if both are 0


    // 2. Pending Invoices Count & Amount
    const pendingInvoices = await prisma.invoice.aggregate({
      _count: { id: true },
      _sum: { total: true },
      where: {
        status: 'Pending',
         // Optionally add dueDate condition, e.g., dueDate: { gte: now }
      },
    });
    const pendingInvoicesCount = pendingInvoices._count.id ?? 0;
    const pendingInvoicesAmount = pendingInvoices._sum.total ?? 0;

    // 3. Open Expense Reports Count (Assuming 'Pending' status)
    const openExpenseReports = await prisma.expense.aggregate({
      _count: { id: true },
      where: {
        status: 'Pending',
      },
    });
    const openExpenseReportsCount = openExpenseReports._count.id ?? 0;

    // 4. Active Accounts Count
    const activeAccountsCount = await prisma.account.count(); // Count all accounts

    return {
      totalExpensesThisMonth,
      pendingInvoicesCount,
      openExpenseReportsCount,
      activeAccountsCount,
      expenseChangePercent,
      pendingInvoicesAmount,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    // Return default/zero values on error
    return {
      totalExpensesThisMonth: 0,
      pendingInvoicesCount: 0,
      openExpenseReportsCount: 0,
      activeAccountsCount: 0,
      expenseChangePercent: null,
      pendingInvoicesAmount: 0,
    };
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
     return expenses;
   } catch (error) {
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
     return invoices;
   } catch (error) {
      console.error("Error fetching recent invoices:", error);
      return [];
   }
}
