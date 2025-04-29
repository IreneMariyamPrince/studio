
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { expenseSchema, ExpenseSchema } from '@/lib/schemas/expense'; // Assuming schema exists

// Type definition for action results
type ActionResult = { success: boolean; message: string; data?: any; error?: unknown };

// --- Get Expenses ---
export async function getExpenses(): Promise<ExpenseSchema[]> {
  try {
    const expenses = await prisma.expense.findMany({
      include: { account: true }, // Include the related account name
      orderBy: { date: 'desc' },
    });

    // Validate fetched data against the schema
     return expenses.map(exp => expenseSchema.parse({
         ...exp,
         date: new Date(exp.date), // Ensure date is a Date object
         account: { // Only include needed fields if Account schema is complex
             id: exp.account.id,
             name: exp.account.name,
             code: exp.account.code,
             type: exp.account.type,
         },
         // Handle potential null description
         description: exp.description ?? undefined,
         receiptUrl: exp.receiptUrl ?? undefined,
     }));
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}

// --- Get Expense by ID ---
export async function getExpenseById(id: string): Promise<ExpenseSchema | null> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!expense) return null;

     return expenseSchema.parse({
         ...expense,
         date: new Date(expense.date),
         account: {
             id: expense.account.id,
             name: expense.account.name,
             code: expense.account.code,
             type: expense.account.type,
         },
         description: expense.description ?? undefined,
         receiptUrl: expense.receiptUrl ?? undefined,
     });
  } catch (error) {
     console.error(`Error fetching expense ${id}:`, error);
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

  const validatedFields = expenseSchema.omit({ id: true, createdAt: true, updatedAt: true, receiptUrl: true, account: true }).safeParse({
     ...rawData,
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
  });

  if (!validatedFields.success) {
     console.error("Expense Validation Failed:", validatedFields.error.flatten().fieldErrors);
    return { success: false, message: 'Validation failed.', error: validatedFields.error.flatten().fieldErrors };
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
  } catch (error) {
    console.error("Error adding expense:", error);
     // Check if account exists
     if ((error as any).code === 'P2003' && (error as any).meta?.field_name?.includes('accountId')) {
         return { success: false, message: 'Invalid account selected.' };
     }
    return { success: false, message: 'Database Error: Failed to add expense.', error };
  }
}

// --- Update Expense ---
const updateExpenseSchema = expenseSchema.extend({
  id: z.string().cuid(), // ID is required for update
}).omit({ createdAt: true, updatedAt: true, receiptUrl: true, account: true }); // Omit fields not updated here

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

   const validatedFields = updateExpenseSchema.safeParse({
     id: expenseId, // Include ID for parsing
     ...rawData,
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
   });

  if (!validatedFields.success) {
     console.error("Expense Update Validation Failed:", validatedFields.error.flatten().fieldErrors);
    return { success: false, message: 'Validation failed.', error: validatedFields.error.flatten().fieldErrors };
  }

  // TODO: Handle potential receipt file update/replacement here.

   const { id, ...updateData } = validatedFields.data;

  try {
    const updatedExpense = await prisma.expense.update({
      where: { id: id },
      data: updateData,
    });

    revalidatePath('/expenses');
     revalidatePath(`/expenses/${id}`); // Revalidate specific expense page if exists
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense updated successfully.', data: updatedExpense };
  } catch (error) {
    console.error("Error updating expense:", error);
     if ((error as any).code === 'P2025') {
       return { success: false, message: 'Expense not found.' };
     }
     if ((error as any).code === 'P2003' && (error as any).meta?.field_name?.includes('accountId')) {
         return { success: false, message: 'Invalid account selected.' };
     }
    return { success: false, message: 'Database Error: Failed to update expense.', error };
  }
}


// --- Delete Expense ---
export async function deleteExpense(id: string): Promise<ActionResult> {
  if (!id) {
     return { success: false, message: 'Expense ID is required for deletion.' };
  }

  try {
     // Optional: Delete associated receipt file from storage first
    await prisma.expense.delete({
      where: { id },
    });

    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense deleted successfully.' };
  } catch (error) {
     console.error("Error deleting expense:", error);
     if ((error as any).code === 'P2025') {
         return { success: false, message: 'Expense not found.' };
     }
    return { success: false, message: 'Database Error: Failed to delete expense.', error };
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
     console.error("Error fetching expense categories:", error);
     return [];
   }
 }
