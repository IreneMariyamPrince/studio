
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { expenseSchema, ExpenseSchema } from '@/lib/schemas/expense'; // Assuming schema exists
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
        account: { // Include only necessary fields from account
            select: { id: true, name: true, code: true, type: true }
        }
       },
      orderBy: { date: 'desc' },
    });

    // Validate fetched data against the schema
     return expenses.map(exp => expenseSchema.parse({
         ...exp,
         date: new Date(exp.date), // Ensure date is a Date object
         // Account should match the select structure if using strict parsing
         account: exp.account,
         // Handle potential null fields from DB -> undefined for zod optional
         description: exp.description ?? undefined,
         receiptUrl: exp.receiptUrl ?? undefined,
     }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching expenses:", error.message);
        if (error.message.includes('libssl')) {
            console.error("This might be due to missing system libraries like 'libssl'. Please check the environment configuration.");
        }
        console.error("Database connection failed. Please check server logs.");
        return []; // Return empty array instead of throwing
    }
    console.error("[ACTION_ERROR] Error fetching expenses:", error);
    return []; // Return empty array on other errors
  }
}

// --- Get Expense by ID ---
export async function getExpenseById(id: string): Promise<ExpenseSchema | null> {
  if (!id) return null;
  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        account: {
            select: { id: true, name: true, code: true, type: true }
        }
       },
    });
    if (!expense) return null;

     return expenseSchema.parse({
         ...expense,
         date: new Date(expense.date),
         account: expense.account,
         description: expense.description ?? undefined,
         receiptUrl: expense.receiptUrl ?? undefined,
     });
  } catch (error) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error fetching expense ${id}:`, error.message);
          if (error.message.includes('libssl')) {
              console.error("Check 'libssl' dependency.");
          }
          console.error("Database connection failed.");
          return null; // Return null on connection failure
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
    status: formData.get('status') || 'Pending', // Default status
    // receiptUrl: formData.get('receiptUrl'), // Handle file upload separately
  };

  // Schema for creation (omitting server-generated fields and relations)
  const createExpenseSchema = expenseSchema.omit({
      id: true, createdAt: true, updatedAt: true, receiptUrl: true, account: true
    });

  const validatedFields = createExpenseSchema.safeParse({
     ...rawData,
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
     description: rawData.description || undefined, // Map empty string to undefined
     status: rawData.status // Already defaulted if null
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error("[VALIDATION_ERROR] addExpense:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  // TODO: Handle receipt file upload here.
  // 1. Receive the file from formData (e.g., formData.get('receiptFile'))
  // 2. Upload it to a storage service (e.g., S3, Google Cloud Storage, local disk in dev)
  // 3. Get the URL or path of the uploaded file.
  const receiptUrl = undefined; // Placeholder

  try {
    const expense = await prisma.expense.create({
      data: {
        ...validatedFields.data,
        receiptUrl: receiptUrl, // Add the URL from upload
      },
    });

    revalidatePath('/expenses');
    revalidatePath('/dashboard'); // Update dashboard stats
    return { success: true, message: 'Expense added successfully.', data: expense };
  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to add expense:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Foreign key constraint failed (e.g., invalid accountId)
        if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('accountId')) {
           return {
               success: false,
               message: 'Database Error: The selected account does not exist.',
               error: error.code,
               fieldErrors: { accountId: ['Invalid account selected.'] }
            };
        }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during expense creation:", error.message);
        if (error.message.includes('libssl')) {
            console.error("Check 'libssl' dependency.");
        }
        return {
            success: false,
            message: 'Database Connection Error. Failed to add expense.',
            error: 'Initialization Error'
        };
    }
    return {
        success: false,
        message: 'Database Error: Failed to add expense.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Expense ---
const updateExpenseFormSchema = expenseSchema.extend({
  id: z.string().cuid(), // ID is required for update
}).omit({ createdAt: true, updatedAt: true, receiptUrl: true, account: true }); // Omit fields not updated directly or via relations

export async function updateExpense(formData: FormData): Promise<ActionResult> {
   const expenseId = formData.get('id') as string;
   if (!expenseId) {
      return { success: false, message: 'Expense ID is missing.' };
   }

   const rawData = {
     date: formData.get('date'),
     accountId: formData.get('accountId'),
     amount: formData.get('amount'),
     description: formData.get('description'),
     status: formData.get('status'),
     // receiptUrl: logic to handle potential new receipt upload
   };

   const validatedFields = updateExpenseFormSchema.safeParse({
     id: expenseId, // Include ID for parsing context, but it's not part of updateData
     ...rawData,
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
     description: rawData.description || undefined, // Map empty string to undefined
     status: rawData.status // Status should be present
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
      where: { id: id }, // Use the validated ID here
      data: updateData, // Use the rest of the validated data
    });

    revalidatePath('/expenses');
     revalidatePath(`/expenses/${id}`); // Revalidate specific expense page if exists
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense updated successfully.', data: updatedExpense };
  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to update expense:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         if (error.code === 'P2025') {
           return { success: false, message: 'Database Error: Expense not found.', error: error.code };
         }
         if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('accountId')) {
             return {
                success: false,
                message: 'Database Error: The selected account does not exist.',
                error: error.code,
                fieldErrors: { accountId: ['Invalid account selected.'] }
            };
         }
     } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during expense update:", error.message);
        if (error.message.includes('libssl')) {
            console.error("Check 'libssl' dependency.");
        }
        return {
            success: false,
            message: 'Database Connection Error. Failed to update expense.',
            error: 'Initialization Error'
        };
    }
    return {
        success: false,
        message: 'Database Error: Failed to update expense.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}


// --- Delete Expense ---
export async function deleteExpense(id: string): Promise<ActionResult> {
  if (!id) {
     return { success: false, message: 'Expense ID is required for deletion.' };
  }

  try {
     // Optional: Delete associated receipt file from storage first
     // await deleteReceiptFromStorage(expense.receiptUrl); // Implement this if needed

    await prisma.expense.delete({
      where: { id },
    });

    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense deleted successfully.' };
  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to delete expense:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Record to delete not found
         if (error.code === 'P2025') {
             return { success: false, message: 'Expense not found. It may have already been deleted.', error: error.code };
         }
      } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during expense deletion:", error.message);
        if (error.message.includes('libssl')) {
            console.error("Check 'libssl' dependency.");
        }
        return {
            success: false,
            message: 'Database Connection Error. Failed to delete expense.',
            error: 'Initialization Error'
        };
    }
     return {
        success: false,
        message: 'Database Error: Failed to delete expense.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}


// --- Get Expense Categories (Account names of type 'Expense') ---
export async function getExpenseCategories(): Promise<{ value: string; label: string }[]> {
   try {
     const expenseAccounts = await prisma.account.findMany({
       where: { type: 'Expense' },
       select: { id: true, name: true },
       orderBy: { name: 'asc' },
     });
     return expenseAccounts.map(acc => ({ value: acc.id, label: acc.name }));
   } catch (error) {
        if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error("[ACTION_ERROR] Prisma Initialization Error fetching expense categories:", error.message);
             if (error.message.includes('libssl')) {
                 console.error("Check 'libssl' dependency.");
             }
             console.error("Database connection failed.");
             return []; // Return empty on connection failure
       }
     console.error("[ACTION_ERROR] Error fetching expense categories:", error);
     return [];
   }
 }
