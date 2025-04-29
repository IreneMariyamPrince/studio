
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { accountSchema, AccountSchema, accountFormSchema } from '@/lib/schemas/account'; // Import form schema
import { Prisma } from '@prisma/client'; // Import Prisma namespace

// Type definition for the result of actions
type ActionResult = { success: boolean; message: string; error?: unknown; fieldErrors?: Record<string, string[]> };

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
             console.error(`DATABASE CONNECTION FAILED (${context}): Prisma failed to initialize. Check database connection details and server logs.`);
         }
         return true; // Indicate an init error occurred
     }
     return false; // Not an init error
}

// --- Get All Accounts ---
export async function getAccounts(): Promise<AccountSchema[]> {
  // Reset flags for this request context
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

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
     if (checkPrismaInitError(error, 'getAccounts')) {
        console.warn("Returning empty accounts list due to database connection failure.");
        // No need to throw here, just return empty array as fallback
     } else {
         // Log other types of errors
         console.error("[ACTION_ERROR] Error fetching accounts:", error);
     }
     // Return empty array for any error to avoid breaking UI completely
     return [];
  }
}

// --- Add New Account ---
export async function addAccount(formData: FormData): Promise<ActionResult> {
  // Reset flags for this request context
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

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
     if (checkPrismaInitError(error, 'addAccount')) {
         // Return specific error message for DB connection failure
         return { success: false, message: 'Database Connection Error: Could not connect to the database to add account.', error: 'Initialization Error' };
     }

    // Handle other Prisma or unknown errors
    console.error("[DB_ERROR] Failed to create account:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (e.g., duplicate account code)
      if (error.code === 'P2002') {
         const target = (error.meta?.target as string[])?.join(', ') || 'field';
         // Provide specific feedback if the duplicate is the code
        if (target.includes('code')) {
            return {
                success: false, message: `Database Error: Account code "${code}" already exists.`, error: error.code,
                fieldErrors: { code: [`Account code "${code}" already exists.`] }
            };
        }
         // Generic unique constraint message otherwise
         return { success: false, message: `Database Error: A unique constraint failed on ${target}.`, error: error.code };
      }
    }
    // Generic database error message
    return { success: false, message: 'Database Error: Failed to create account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Account ---
// Use form schema extended with ID for validation
const updateAccountFormSchema = accountFormSchema.extend({
  id: z.string().cuid({ message: "Invalid account ID." }),
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
  // Reset flags for this request context
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

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
     if (checkPrismaInitError(error, 'updateAccount')) {
         return { success: false, message: 'Database Connection Error during account update.', error: 'Initialization Error' };
     }

     console.error("[DB_ERROR] Failed to update account:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle specific known errors
        if (error.code === 'P2025') return { success: false, message: 'Database Error: Account not found.', error: error.code };
        if (error.code === 'P2002') {
           const target = (error.meta?.target as string[])?.join(', ') || 'field';
           // Specific feedback for duplicate code
            if (target.includes('code')) {
                return {
                    success: false, message: `Database Error: Account code "${updateData.code}" is already in use.`, error: error.code,
                    fieldErrors: { code: [`Account code "${updateData.code}" is already in use.`] }
                };
            }
           return { success: false, message: `Database Error: A unique constraint failed on ${target}.`, error: error.code };
        }
      }
     return { success: false, message: 'Database Error: Failed to update account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Delete Account ---
export async function deleteAccount(id: string): Promise<ActionResult> {
  // Reset flags for this request context
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  // Basic ID validation
  if (!id || typeof id !== 'string' || id.length < 5) { // Basic CUID length check
     return { success: false, message: 'Invalid Account ID provided.' };
  }

  try {
    // IMPORTANT: Check if the account has a non-zero balance or related transactions before deleting.
    // Prisma's 'Restrict' onDelete will prevent deletion if relations exist (Expenses, JournalEntryLines).
    // You might want a soft delete (setting isActive=false) instead of hard delete.
    const account = await prisma.account.findUnique({
        where: { id },
        select: { balance: true, _count: { select: { expenses: true, journalEntryLines: true }} } // Check for relations
    });

    // If account doesn't exist
    if (!account) {
         return { success: false, message: 'Account not found.', error: 'P2025' };
    }

    // Add check for non-zero balance if required by business logic
    // if (account.balance?.toNumber() !== 0) {
    //     return { success: false, message: 'Cannot delete account with a non-zero balance.' };
    // }

    // Check if related records exist (even if balance is zero)
    if ((account._count?.expenses ?? 0) > 0 || (account._count?.journalEntryLines ?? 0) > 0) {
        return { success: false, message: 'Cannot delete account: It is linked to existing Expenses or Journal Entries.', error: 'P2003' };
    }

    // Attempt to delete (should succeed if no relations exist)
    await prisma.account.delete({ where: { id } });

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: 'Account deleted successfully.' };

  } catch (error: unknown) {
     if (checkPrismaInitError(error, 'deleteAccount')) {
         return { success: false, message: 'Database Connection Error during account deletion.', error: 'Initialization Error' };
     }

     console.error("[DB_ERROR] Failed to delete account:", error);
     // Handle Prisma errors that might occur despite checks (e.g., race conditions)
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return { success: false, message: 'Account not found.', error: error.code };
        // Foreign key constraint failed (onDelete: Restrict worked - this case is covered above, but good practice)
        if (error.code === 'P2003') {
           return { success: false, message: 'Cannot delete account: It is linked to existing records.', error: error.code };
        }
      }
     return { success: false, message: 'Database Error: Failed to delete account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Get Account by ID ---
export async function getAccountById(id: string): Promise<AccountSchema | null> {
  // Reset flags for this request context
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  if (!id) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return null;
    // Parse the fetched data using the main schema
    return accountSchema.parse({
        ...account,
        description: account.description ?? undefined,
        balance: account.balance?.toNumber(),
    });
  } catch (error: unknown) {
     if (checkPrismaInitError(error, `getAccountById (${id})`)) {
        console.warn(`Returning null for getAccountById(${id}) due to database connection failure.`);
     } else {
        console.error(`[ACTION_ERROR] Error fetching account ${id}:`, error);
     }
    return null; // Return null on any error
  }
}
