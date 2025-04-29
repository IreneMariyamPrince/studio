
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { accountSchema, AccountSchema } from '@/lib/schemas/account';

// Type definition for the result of actions
type ActionResult = { success: boolean; message: string; error?: unknown };

// --- Get All Accounts ---
export async function getAccounts(): Promise<AccountSchema[]> {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { code: 'asc' },
    });
    return accounts.map(account => accountSchema.parse(account)); // Validate fetched data
  } catch (error) {
    console.error("Error fetching accounts:", error);
    // In a real app, handle this error more gracefully (e.g., return specific error object)
    return [];
  }
}

// --- Add New Account ---
export async function addAccount(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = accountSchema.safeParse({
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || null, // Ensure optional fields are null if empty
  });

  if (!validatedFields.success) {
    console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      success: false,
      message: 'Validation failed. Please check the form fields.',
      error: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { code, name, type, description } = validatedFields.data;

  try {
    // Check if account code already exists
    const existingAccount = await prisma.account.findUnique({ where: { code } });
    if (existingAccount) {
      return { success: false, message: `Account code "${code}" already exists.` };
    }

    await prisma.account.create({
      data: {
        code,
        name,
        type,
        description,
      },
    });

    revalidatePath('/chart-of-accounts'); // Update the cache for the accounts page
    return { success: true, message: `Account "${name}" created successfully.` };
  } catch (error) {
    console.error("Error creating account:", error);
    return { success: false, message: 'Database Error: Failed to create account.', error };
  }
}

// --- Update Account ---
const updateAccountSchema = accountSchema.extend({
  id: z.string().cuid(), // Ensure ID is provided and is a valid CUID
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

   const validatedFields = updateAccountSchema.safeParse({
    id: rawData.id,
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || null,
  });

  if (!validatedFields.success) {
     console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      success: false,
      message: 'Validation failed. Please check the form fields.',
      error: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { id, code, name, type, description } = validatedFields.data;

  try {
     // Check if account with the new code already exists (and it's not the same account)
     const existingAccountWithCode = await prisma.account.findUnique({ where: { code } });
     if (existingAccountWithCode && existingAccountWithCode.id !== id) {
       return { success: false, message: `Account code "${code}" is already used by another account.` };
     }

    await prisma.account.update({
      where: { id },
      data: {
        code,
        name,
        type,
        description,
      },
    });

    revalidatePath('/chart-of-accounts');
    return { success: true, message: `Account "${name}" updated successfully.` };
  } catch (error) {
     console.error("Error updating account:", error);
    // Handle specific Prisma errors like P2025 (Record not found) if needed
    return { success: false, message: 'Database Error: Failed to update account.', error };
  }
}

// --- Delete Account ---
export async function deleteAccount(id: string): Promise<ActionResult> {
  if (!id) {
     return { success: false, message: 'Account ID is required for deletion.' };
  }

  // Add checks here: Can this account be deleted?
  // e.g., Are there associated expenses or invoices?
  // const relatedExpenses = await prisma.expense.count({ where: { accountId: id } });
  // if (relatedExpenses > 0) {
  //   return { success: false, message: 'Cannot delete account with associated expenses.' };
  // }
  // Add similar checks for other relations if necessary.

  try {
    await prisma.account.delete({
      where: { id },
    });

    revalidatePath('/chart-of-accounts');
    return { success: true, message: 'Account deleted successfully.' };
  } catch (error) {
     console.error("Error deleting account:", error);
    // Handle specific Prisma errors like P2025 (Record not found)
     if ((error as any).code === 'P2025') {
         return { success: false, message: 'Account not found.' };
     }
     if ((error as any).code === 'P2003') { // Foreign key constraint failed
        return { success: false, message: 'Cannot delete account because it is linked to other records (e.g., expenses).', error };
     }
    return { success: false, message: 'Database Error: Failed to delete account.', error };
  }
}

// --- Get Account by ID (Example) ---
export async function getAccountById(id: string): Promise<AccountSchema | null> {
  try {
    const account = await prisma.account.findUnique({ where: { id } });
    return account ? accountSchema.parse(account) : null;
  } catch (error) {
     console.error(`Error fetching account with ID ${id}:`, error);
    return null;
  }
}
