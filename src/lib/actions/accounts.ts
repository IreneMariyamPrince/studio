
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { accountSchema, AccountSchema, accountFormSchema } from '@/lib/schemas/account'; // Import form schema
import { Prisma } from '@prisma/client'; // Import Prisma namespace

// Type definition for the result of actions
type ActionResult = { success: boolean; message: string; error?: unknown; fieldErrors?: Record<string, string[]> };

// --- Get All Accounts ---
export async function getAccounts(): Promise<AccountSchema[]> {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { code: 'asc' },
    });
    // Validate fetched data, ensuring optional fields are handled
    return accounts.map(account => accountSchema.parse({
        ...account,
        description: account.description ?? undefined, // Map null to undefined for zod optional
        balance: account.balance?.toNumber(), // Convert Decimal to number
    }));
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching accounts:", error.message);
        if (error.message.includes('libssl')) {
          console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL is installed and accessible in your deployment environment. Returning empty list.");
        } else {
             console.error("DATABASE CONNECTION FAILED: Prisma failed to initialize. Check database connection details and server logs. Returning empty list.");
        }
        // Return empty array to prevent breaking the page, but signal the error
        return []; // Return empty array instead of throwing
    } else {
        // Log other types of errors
        console.error("[ACTION_ERROR] Error fetching accounts:", error);
        // Return empty array for non-init errors to avoid breaking UI completely
        return [];
    }
  }
}

// --- Add New Account ---
export async function addAccount(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = accountFormSchema.safeParse({ // Use form schema (omits id, balance, etc.)
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || undefined, // Map empty string to undefined for optional field
    isActive: rawData.isActive ? rawData.isActive === 'true' : true, // Handle checkbox value
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error("[VALIDATION_ERROR] addAccount:", fieldErrors);
    return {
      success: false,
      message: 'Validation failed. Please check the form fields.',
      error: "Validation Error",
      fieldErrors: fieldErrors,
    };
  }

  const { code, name, type, description, isActive } = validatedFields.data;

  try {
    // Initial balance is set to 0 by default in Prisma schema
    const newAccount = await prisma.account.create({
      data: {
        code,
        name,
        type,
        description,
        isActive,
        // balance: 0 // Handled by DB default
      },
    });

    revalidatePath('/chart-of-accounts'); // Update the cache for the accounts page
    revalidatePath('/reports'); // Potentially affects reports
    return { success: true, message: `Account "${name}" (Code: ${code}) created successfully.` };

  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to create account:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
         const target = (error.meta?.target as string[])?.join(', ') || 'field';
        if (target.includes('code')) {
            return {
                success: false, message: `Database Error: Account code "${code}" already exists.`, error: error.code,
                fieldErrors: { code: [`Account code "${code}" already exists.`] }
            };
        }
         return { success: false, message: `Database Error: A unique constraint failed on ${target}.`, error: error.code };
      }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error("[DB_ERROR] Prisma Initialization Error during account creation:", error.message);
          if (error.message.includes('libssl')) {
               console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
           }
         return { success: false, message: 'Database Connection Error: Could not connect to the database.', error: 'Initialization Error' };
     }
    return { success: false, message: 'Database Error: Failed to create account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Account ---
// Use form schema extended with ID for validation
const updateAccountFormSchema = accountFormSchema.extend({
  id: z.string().cuid({ message: "Invalid account ID." }),
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

   const validatedFields = updateAccountFormSchema.safeParse({
    id: rawData.id,
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || undefined, // Map empty string to undefined
    isActive: rawData.isActive ? rawData.isActive === 'true' : true,
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error("[VALIDATION_ERROR] updateAccount:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  // Exclude ID from the data payload for the update operation
  const { id, ...updateData } = validatedFields.data;

  try {
    // Balance is NOT updated here; it's managed by transactions
    const updatedAccount = await prisma.account.update({
      where: { id },
      data: updateData,
    });

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: `Account "${updateData.name}" (Code: ${updateData.code}) updated successfully.` };
  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to update account:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return { success: false, message: 'Database Error: Account not found.', error: error.code };
        if (error.code === 'P2002') {
           const target = (error.meta?.target as string[])?.join(', ') || 'field';
            if (target.includes('code')) {
                return {
                    success: false, message: `Database Error: Account code "${updateData.code}" is already in use.`, error: error.code,
                    fieldErrors: { code: [`Account code "${updateData.code}" is already in use.`] }
                };
            }
           return { success: false, message: `Database Error: A unique constraint failed on ${target}.`, error: error.code };
        }
      } else if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error("[DB_ERROR] Prisma Initialization Error during account update:", error.message);
          if (error.message.includes('libssl')) {
               console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
           }
         return { success: false, message: 'Database Initialization Error.', error: 'Initialization Error' };
     }
     return { success: false, message: 'Database Error: Failed to update account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Delete Account ---
export async function deleteAccount(id: string): Promise<ActionResult> {
  if (!id || typeof id !== 'string' || id.length < 5) {
     return { success: false, message: 'Invalid Account ID provided.' };
  }

  try {
    // IMPORTANT: Check if the account has a non-zero balance or related transactions before deleting.
    // Prisma's 'Restrict' onDelete will prevent deletion if relations exist (Expenses, JournalEntryLines).
    // You might want a soft delete (setting isActive=false) instead of hard delete.
    const account = await prisma.account.findUnique({
        where: { id },
        select: { balance: true, _count: { select: { expenses: true, journalEntryLines: true }} }
    });

    if (!account) {
         return { success: false, message: 'Account not found.', error: 'P2025' };
    }

    // Add check for non-zero balance if required
    // if (account.balance?.toNumber() !== 0) {
    //     return { success: false, message: 'Cannot delete account with a non-zero balance.' };
    // }

    // Attempt to delete (will fail if relations exist due to onDelete: Restrict)
    await prisma.account.delete({ where: { id } });

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: 'Account deleted successfully.' };

  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to delete account:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return { success: false, message: 'Account not found.', error: error.code };
        // Foreign key constraint failed (onDelete: Restrict worked)
        if (error.code === 'P2003') {
           return { success: false, message: 'Cannot delete account: It is linked to existing Expenses or Journal Entries.', error: error.code };
        }
      } else if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error("[DB_ERROR] Prisma Initialization Error during account deletion:", error.message);
          if (error.message.includes('libssl')) {
               console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
           }
         return { success: false, message: 'Database Initialization Error.', error: 'Initialization Error' };
     }
     return { success: false, message: 'Database Error: Failed to delete account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Get Account by ID (Remains similar, adjusted parsing) ---
export async function getAccountById(id: string): Promise<AccountSchema | null> {
  if (!id) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return null;
    return accountSchema.parse({
        ...account,
        description: account.description ?? undefined,
        balance: account.balance?.toNumber(),
    });
  } catch (error: unknown) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error(`[ACTION_ERROR] Prisma Initialization Error fetching account ${id}:`, error.message);
          if (error.message.includes('libssl')) {
               console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
           }
        console.error("Database connection failed.");
        return null;
     } else {
        console.error(`[ACTION_ERROR] Error fetching account ${id}:`, error);
     }
    return null; // Or throw / return error object
  }
}
