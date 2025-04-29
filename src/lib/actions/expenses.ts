
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { expenseSchema, expenseFormSchema, ExpenseSchema } from '@/lib/schemas/expense'; // Adjusted imports
import type { Prisma } from '@prisma/client'; // Import Prisma types
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
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

// --- Get Expenses for the current tenant ---
export async function getExpenses(): Promise<ExpenseSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getExpenses.");
      return [];
  }

  try {
    const expenses = await prisma.expense.findMany({
      where: { tenantId: tenantId }, // Filter by tenant
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
        vendor: { select: { id: true, name: true } }, // Include vendor name
        // taxRate: { select: { id: true, name: true, ratePercent: true } } // Include tax info if needed
       },
      orderBy: { date: 'desc' },
    });

    // Validate fetched data against the schema
     return expenses.map(exp => expenseSchema.parse({
         ...exp,
         date: new Date(exp.date), // Ensure date is a Date object
         amount: exp.amount.toNumber(), // Convert Decimal to number
         account: exp.account,
         vendor: exp.vendor ? { ...exp.vendor } : undefined, // Ensure vendor structure matches schema
         // taxRate: exp.taxRate ? { ...exp.taxRate, ratePercent: exp.taxRate.ratePercent.toNumber() } : undefined,
         description: exp.description ?? undefined,
         receiptUrl: exp.receiptUrl ?? undefined,
         recurrenceRule: exp.recurrenceRule ?? undefined,
         vendorId: exp.vendorId ?? undefined,
         taxRateId: exp.taxRateId ?? undefined,
     }));
  } catch (error) {
     if (checkPrismaInitError(error, `getExpenses (Tenant: ${tenantId})`)) {
        console.warn(`Returning empty expenses list for tenant ${tenantId} due to DB connection issue.`);
     } else {
        console.error(`[ACTION_ERROR] Error fetching expenses for tenant ${tenantId}:`, error);
     }
    return [];
  }
}

// --- Get Expense by ID (ensuring it belongs to the current tenant) ---
export async function getExpenseById(id: string): Promise<ExpenseSchema | null> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       console.error("[ACTION_ERROR] Tenant ID not found in getExpenseById.");
       return null;
   }

  if (!id) return null;
  try {
    const expense = await prisma.expense.findUnique({
      where: { id }, // ID is globally unique
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
        vendor: { select: { id: true, name: true } },
        // taxRate: { select: { id: true, name: true, ratePercent: true } }
       },
    });

    if (!expense || expense.tenantId !== tenantId) {
        // Not found or doesn't belong to the current tenant
        return null;
    }

     return expenseSchema.parse({
         ...expense,
         date: new Date(expense.date),
         amount: expense.amount.toNumber(),
         account: expense.account,
         vendor: expense.vendor ? { ...expense.vendor } : undefined,
         // taxRate: expense.taxRate ? { ...expense.taxRate, ratePercent: expense.taxRate.ratePercent.toNumber() } : undefined,
         description: expense.description ?? undefined,
         receiptUrl: expense.receiptUrl ?? undefined,
         recurrenceRule: expense.recurrenceRule ?? undefined,
          vendorId: expense.vendorId ?? undefined,
         taxRateId: expense.taxRateId ?? undefined,
     });
  } catch (error: unknown) {
      if (checkPrismaInitError(error, `getExpenseById (${id}, Tenant: ${tenantId})`)) {
           console.warn(`Returning null for getExpenseById(${id}, Tenant: ${tenantId}) due to DB connection issue.`);
      } else {
           console.error(`[ACTION_ERROR] Error fetching expense ${id} for tenant ${tenantId}:`, error);
      }
    return null;
  }
}


// --- Add New Expense for the current tenant ---
export async function addExpense(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add expense.' };
   }

  const rawData = {
    date: formData.get('date'),
    accountId: formData.get('accountId'),
    amount: formData.get('amount'),
    description: formData.get('description'),
    status: formData.get('status') || 'Pending', // Default status from schema
    vendorId: formData.get('vendorId'),
    isRecurring: formData.get('isRecurring') === 'true',
    recurrenceRule: formData.get('recurrenceRule'),
    taxRateId: formData.get('taxRateId'),
    // receiptFile: formData.get('receiptFile') // Handle file separately
  };

  const validatedFields = expenseFormSchema.safeParse({
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     accountId: rawData.accountId,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
     description: rawData.description || undefined, // Map empty string to undefined
     status: rawData.status,
     vendorId: rawData.vendorId || undefined, // Handle empty string from select
     isRecurring: rawData.isRecurring,
     recurrenceRule: rawData.recurrenceRule || undefined,
     taxRateId: rawData.taxRateId || undefined, // Handle empty string from select
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error(`[VALIDATION_ERROR] addExpense (Tenant: ${tenantId}):`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

   // Validate that selected Account, Vendor, TaxRate belong to the tenant
   try {
       const accountId = validatedFields.data.accountId;
       const vendorId = validatedFields.data.vendorId;
       const taxRateId = validatedFields.data.taxRateId;

       const account = await prisma.account.findUnique({ where: { id: accountId }, select: { tenantId: true, type: true } });
       if (!account || account.tenantId !== tenantId || account.type !== 'Expense') {
           return { success: false, message: 'Invalid expense account selected.', fieldErrors: { accountId: ['Invalid expense account.'] } };
       }

       if (vendorId) {
           const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { tenantId: true } });
           if (!vendor || vendor.tenantId !== tenantId) {
                return { success: false, message: 'Invalid vendor selected.', fieldErrors: { vendorId: ['Invalid vendor.'] } };
           }
       }
       if (taxRateId) {
            const taxRate = await prisma.taxRate.findUnique({ where: { id: taxRateId }, select: { tenantId: true } });
            if (!taxRate || taxRate.tenantId !== tenantId) {
                 return { success: false, message: 'Invalid tax rate selected.', fieldErrors: { taxRateId: ['Invalid tax rate.'] } };
            }
       }
   } catch (error) {
       console.error(`[DB_ERROR] Error validating relations for tenant ${tenantId} during expense creation:`, error);
       return { success: false, message: 'Database error during validation.' };
   }


  // TODO: Handle receipt file upload here (Firebase Storage or other service)
  const receiptUrl = undefined; // Placeholder

  try {
    const expense = await prisma.expense.create({
      data: {
        ...validatedFields.data,
        tenantId: tenantId, // Set tenant ID
        receiptUrl: receiptUrl, // Save the URL from storage
      },
    });

    revalidatePath('/expenses');
    revalidatePath('/dashboard'); // Update dashboard stats
    return { success: true, message: 'Expense added successfully.', data: expense };
  } catch (error: unknown) {
     if (checkPrismaInitError(error, `addExpense (Tenant: ${tenantId})`)) {
         return { success: false, message: 'Database Connection Error. Failed to add expense.', error: 'Initialization Error' };
     }
    console.error(`[DB_ERROR] Failed to add expense for tenant ${tenantId}:`, error);
    // Specific error handling for P2003 (foreign key) is less likely now due to pre-validation,
    // but kept for robustness.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
            const fieldName = (error.meta?.field_name as string) || 'related record';
            return { success: false, message: `Database Error: Invalid ${fieldName}. Record not found.`, error: error.code };
        }
    }
    return { success: false, message: 'Database Error: Failed to add expense.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Expense for the current tenant ---
const updateExpenseFormSchema = expenseFormSchema.extend({
  id: z.string().cuid(),
});

export async function updateExpense(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const expenseId = formData.get('id') as string;
   if (!expenseId) return { success: false, message: 'Expense ID is missing.' };

   // 1. Verify expense belongs to the tenant
    try {
        const expense = await prisma.expense.findUnique({ where: { id: expenseId }, select: { tenantId: true } });
        if (!expense) return { success: false, message: 'Expense not found.' };
        if (expense.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
        // Handle DB error
        return { success: false, message: 'Database error verifying expense ownership.' };
    }

   // 2. Validate form data and related entities (Account, Vendor, TaxRate) similar to addExpense
   // ...

   const { id, ...updateData } = {id: expenseId /*... validated data ... */}; // Exclude ID from data payload

   // TODO: Handle potential receipt file update/replacement here.

  try {
    const updatedExpense = await prisma.expense.update({
      where: { id: id },
      data: {
          ...updateData,
          // receiptUrl: updatedReceiptUrl // Add logic for updated URL
      },
    });

    revalidatePath('/expenses');
    revalidatePath(`/expenses/${id}`);
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense updated successfully.', data: updatedExpense };
  } catch (error: unknown) {
     if (checkPrismaInitError(error, `updateExpense (${id}, Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to update expense.', error: 'Initialization Error' };
     }
    console.error(`[DB_ERROR] Failed to update expense ${id} for tenant ${tenantId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return { success: false, message: 'Database Error: Expense not found.', error: error.code };
        // Handle P2003 (foreign key constraint) if validation missed something
    }
    return { success: false, message: 'Database Error: Failed to update expense.', error: error instanceof Error ? error.message : String(error) };
  }
}


// --- Delete Expense for the current tenant ---
export async function deleteExpense(id: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!id) return { success: false, message: 'Expense ID is required.' };

  try {
     // Verify expense belongs to the tenant
     const expense = await prisma.expense.findUnique({ where: { id }, select: { tenantId: true, receiptUrl: true } });
     if (!expense) return { success: false, message: 'Expense not found.', error: 'P2025' };
     if (expense.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };

     // Optional: Delete associated receipt file from storage first
     // if (expense.receiptUrl) {
     //    await deleteFileFromFirebaseStorage(expense.receiptUrl);
     // }

    await prisma.expense.delete({ where: { id } });

    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense deleted successfully.' };
  } catch (error: unknown) {
     if (checkPrismaInitError(error, `deleteExpense (${id}, Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to delete expense.', error: 'Initialization Error' };
     }
     console.error(`[DB_ERROR] Failed to delete expense ${id} for tenant ${tenantId}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          return { success: false, message: 'Expense not found.', error: error.code };
      }
     return { success: false, message: 'Database Error: Failed to delete expense.', error: error instanceof Error ? error.message : String(error) };
  }
}


// --- Get Expense Categories (Accounts of type 'Expense' for the current tenant) ---
export async function getExpenseCategories(): Promise<{ value: string; label: string }[]> {
    const tenantId = await getTenantId();
    if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getExpenseCategories.");
      return [];
    }
   try {
     const expenseAccounts = await prisma.account.findMany({
       where: {
           tenantId: tenantId, // Filter by tenant
           type: 'Expense',
           isActive: true
        },
       select: { id: true, name: true, code: true },
       orderBy: { name: 'asc' },
     });
     // Format label to include code for clarity
     return expenseAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` }));
   } catch (error) {
        if (checkPrismaInitError(error, `getExpenseCategories (Tenant: ${tenantId})`)) {
             console.warn(`Returning empty expense categories for tenant ${tenantId} due to DB connection issue.`);
        } else {
            console.error(`[ACTION_ERROR] Error fetching expense categories for tenant ${tenantId}:`, error);
        }
     return [];
   }
 }
