
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { expenseSchema, expenseFormSchema, ExpenseSchema } from '@/lib/schemas/expense'; // Adjusted imports
import type { Prisma } from '@prisma/client'; // Import Prisma types

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Get Expenses ---
export async function getExpenses(): Promise<ExpenseSchema[]> {
  try {
    const expenses = await prisma.expense.findMany({
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
    if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching expenses:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library. Ensure OpenSSL is installed. Returning empty list.");
         } else {
              console.error("Database connection failed. Returning empty list.");
         }
        return [];
    }
    console.error("[ACTION_ERROR] Error fetching expenses:", error);
    return [];
  }
}

// --- Get Expense by ID ---
export async function getExpenseById(id: string): Promise<ExpenseSchema | null> {
  if (!id) return null;
  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
        vendor: { select: { id: true, name: true } },
        // taxRate: { select: { id: true, name: true, ratePercent: true } }
       },
    });
    if (!expense) return null;

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
  } catch (error) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error fetching expense ${id}:`, error.message);
          if (error.message.includes('libssl')) {
               console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library. Ensure OpenSSL is installed.");
           } else {
              console.error("Database connection failed.");
           }
          return null;
      }
     console.error(`[ACTION_ERROR] Error fetching expense ${id}:`, error);
    return null;
  }
}


// --- Add New Expense ---
export async function addExpense(formData: FormData): Promise<ActionResult> {
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
     console.error("[VALIDATION_ERROR] addExpense:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  // TODO: Handle receipt file upload here (Firebase Storage or other service)
  // const receiptFile = rawData.receiptFile as File | null;
  // let receiptUrl = undefined;
  // if (receiptFile) {
  //    try {
  //       receiptUrl = await uploadFileToFirebaseStorage(receiptFile, `receipts/${generateUniqueFilename(receiptFile.name)}`);
  //    } catch (uploadError) {
  //       console.error("Receipt upload failed:", uploadError);
  //       return { success: false, message: 'Receipt upload failed.', error: 'File Upload Error' };
  //    }
  // }
  const receiptUrl = undefined; // Placeholder

  try {
    const expense = await prisma.expense.create({
      data: {
        ...validatedFields.data,
        receiptUrl: receiptUrl, // Save the URL from storage
      },
    });

    revalidatePath('/expenses');
    revalidatePath('/dashboard'); // Update dashboard stats
    return { success: true, message: 'Expense added successfully.', data: expense };
  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to add expense:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Foreign key constraint failed (e.g., invalid accountId, vendorId, taxRateId)
        if (error.code === 'P2003') {
            const fieldName = (error.meta?.field_name as string) || 'related record';
            let userMessage = `Database Error: Invalid ${fieldName}. Record not found.`;
            let fieldKey: keyof ExpenseFormSchema | undefined;
            if (fieldName.includes('accountId')) { userMessage = 'Invalid account selected.'; fieldKey = 'accountId'; }
            if (fieldName.includes('vendorId')) { userMessage = 'Invalid vendor selected.'; fieldKey = 'vendorId'; }
            if (fieldName.includes('taxRateId')) { userMessage = 'Invalid tax rate selected.'; fieldKey = 'taxRateId'; }

           return {
               success: false, message: userMessage, error: error.code,
               fieldErrors: fieldKey ? { [fieldKey]: [userMessage] } : undefined
            };
        }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during expense creation:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
         }
        return { success: false, message: 'Database Connection Error. Failed to add expense.', error: 'Initialization Error' };
    }
    return { success: false, message: 'Database Error: Failed to add expense.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Expense ---
// Use form schema extended with ID for validation
const updateExpenseFormSchema = expenseFormSchema.extend({
  id: z.string().cuid(),
});

export async function updateExpense(formData: FormData): Promise<ActionResult> {
   const expenseId = formData.get('id') as string;
   if (!expenseId) return { success: false, message: 'Expense ID is missing.' };

   const rawData = {
     date: formData.get('date'),
     accountId: formData.get('accountId'),
     amount: formData.get('amount'),
     description: formData.get('description'),
     status: formData.get('status'),
     vendorId: formData.get('vendorId'),
     isRecurring: formData.get('isRecurring') === 'true',
     recurrenceRule: formData.get('recurrenceRule'),
     taxRateId: formData.get('taxRateId'),
     // Handle receipt update/removal separately
   };

   const validatedFields = updateExpenseFormSchema.safeParse({
     id: expenseId,
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     accountId: rawData.accountId,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
     description: rawData.description || undefined,
     status: rawData.status,
     vendorId: rawData.vendorId || undefined,
     isRecurring: rawData.isRecurring,
     recurrenceRule: rawData.recurrenceRule || undefined,
     taxRateId: rawData.taxRateId || undefined,
   });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error("[VALIDATION_ERROR] updateExpense:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  // TODO: Handle potential receipt file update/replacement here.

   const { id, ...updateData } = validatedFields.data; // Exclude ID from data payload

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
    console.error("[DB_ERROR] Failed to update expense:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         if (error.code === 'P2025') return { success: false, message: 'Database Error: Expense not found.', error: error.code };
         if (error.code === 'P2003') { // Foreign key constraint
            const fieldName = (error.meta?.field_name as string) || 'related record';
            let userMessage = `Database Error: Invalid ${fieldName}. Record not found.`;
            let fieldKey: keyof ExpenseFormSchema | undefined;
            if (fieldName.includes('accountId')) { userMessage = 'Invalid account selected.'; fieldKey = 'accountId'; }
            if (fieldName.includes('vendorId')) { userMessage = 'Invalid vendor selected.'; fieldKey = 'vendorId'; }
            if (fieldName.includes('taxRateId')) { userMessage = 'Invalid tax rate selected.'; fieldKey = 'taxRateId'; }
             return {
                success: false, message: userMessage, error: error.code,
                 fieldErrors: fieldKey ? { [fieldKey]: [userMessage] } : undefined
            };
         }
     } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during expense update:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
         }
        return { success: false, message: 'Database Connection Error. Failed to update expense.', error: 'Initialization Error' };
    }
    return { success: false, message: 'Database Error: Failed to update expense.', error: error instanceof Error ? error.message : String(error) };
  }
}


// --- Delete Expense ---
export async function deleteExpense(id: string): Promise<ActionResult> {
  if (!id) return { success: false, message: 'Expense ID is required.' };

  try {
     // Optional: Delete associated receipt file from storage first
     const expense = await prisma.expense.findUnique({ where: { id }, select: { receiptUrl: true } });
     // if (expense?.receiptUrl) {
     //    await deleteFileFromFirebaseStorage(expense.receiptUrl);
     // }

    await prisma.expense.delete({ where: { id } });

    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense deleted successfully.' };
  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to delete expense:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         if (error.code === 'P2025') return { success: false, message: 'Expense not found.', error: error.code };
      } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during expense deletion:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
         }
        return { success: false, message: 'Database Connection Error. Failed to delete expense.', error: 'Initialization Error' };
    }
     return { success: false, message: 'Database Error: Failed to delete expense.', error: error instanceof Error ? error.message : String(error) };
  }
}


// --- Get Expense Categories (Account names of type 'Expense') ---
export async function getExpenseCategories(): Promise<{ value: string; label: string }[]> {
   try {
     const expenseAccounts = await prisma.account.findMany({
       where: { type: 'Expense', isActive: true }, // Only active expense accounts
       select: { id: true, name: true, code: true },
       orderBy: { name: 'asc' },
     });
     // Format label to include code for clarity
     return expenseAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` }));
   } catch (error) {
        if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error("[ACTION_ERROR] Prisma Initialization Error fetching expense categories:", error.message);
             if (error.message.includes('libssl')) {
                  console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library. Ensure OpenSSL is installed. Returning empty list.");
             } else {
                  console.error("Database connection failed. Returning empty list.");
             }
             return [];
       }
     console.error("[ACTION_ERROR] Error fetching expense categories:", error);
     return [];
   }
 }
