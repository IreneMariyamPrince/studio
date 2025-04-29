
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client'; // Import Prisma namespace
import { accountSchema, AccountSchema, accountFormSchema } from '@/lib/schemas/account'; // Import form schema
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Import specific error type
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID (implement this)

// Type definition for the result of actions
type ActionResult = {
    success: boolean;
    message: string;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Flag to prevent spamming the console with the same libssl error
let libsslErrorLogged = false;

// Helper function to check and log Prisma init errors
// Returns true if it WAS an initialization error, false otherwise
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Log the more detailed environment message only once
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 or 3 (check Prisma version compatibility) is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging
         }
         return true; // Indicate that it was an initialization error
     }
     return false; // Not an initialization error
}

// --- Get All Accounts for the current tenant ---
export async function getAccounts(): Promise<AccountSchema[]> {
  const tenantId = await getTenantId(); // Get tenant ID from session/context
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getAccounts.");
      return []; // Or throw an error
  }
  const context = `getAccounts (Tenant: ${tenantId})`;

  try {
    const accounts = await prisma.account.findMany({
      where: { tenantId: tenantId }, // Filter by tenant ID
      orderBy: { code: 'asc' },
    });
    // Validate fetched data, ensuring optional fields are handled
    return accounts.map(account => accountSchema.parse({
        ...account,
        description: account.description ?? undefined, // Map null to undefined for zod optional
        balance: account.balance?.toNumber(), // Convert Decimal to number
    }));
  } catch (error: unknown) {
     if (checkPrismaInitError(error, context)) {
         console.warn(`[DB_WARN] Database connection failed while fetching accounts for tenant ${tenantId}. Returning empty list.`);
     } else {
         // Log other types of errors
         console.error(`[ACTION_ERROR] Error fetching accounts for tenant ${tenantId}:`, error);
          console.warn(`[DB_WARN] Returning empty accounts list for tenant ${tenantId} due to unexpected error.`);
     }
     // Return empty array to prevent breaking UI, but log the error
     return [];
  }
}

// --- Add New Account for the current tenant ---
export async function addAccount(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      return { success: false, message: 'Tenant ID not found. Cannot add account.' };
  }
  const context = `addAccount (Tenant: ${tenantId})`;

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
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
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
        tenantId: tenantId, // Associate with the current tenant
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
     if (checkPrismaInitError(error, context)) {
         return { success: false, message: 'Database Connection Error: Could not connect to the database to add account.', error: 'Initialization Error' };
     }

    // Handle other Prisma or unknown errors
    console.error(`[DB_ERROR] ${context}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (e.g., duplicate account code *within the tenant*)
      if (error.code === 'P2002') {
         const target = (error.meta?.target as string[])?.join(', ') || 'field';
         // Provide specific feedback if the duplicate is the code
        if (target.includes('code') && target.includes('tenantId')) { // Check for composite key violation
            return {
                success: false, message: `Database Error: Account code "${code}" already exists for this tenant.`, error: error.code,
                fieldErrors: { code: [`Account code "${code}" already exists for this tenant.`] }
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

// --- Update Account for the current tenant ---
// Use form schema extended with ID for validation
const updateAccountFormSchema = accountFormSchema.extend({
  id: z.string().cuid({ message: "Invalid account ID." }),
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot update account.' };
   }
   const accountId = formData.get('id') as string;
   const context = `updateAccount (ID: ${accountId}, Tenant: ${tenantId})`;

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
     console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  // Exclude ID from the data payload for the update operation
  const { id, ...updateData } = validatedFields.data;

  try {
    // Verify the account belongs to the current tenant before updating
    const account = await prisma.account.findUnique({
      where: { id },
      select: { tenantId: true }
    });

    if (!account) {
        return { success: false, message: 'Database Error: Account not found.', error: 'P2025' };
    }

    if (account.tenantId !== tenantId) {
        console.warn(`[AUTH_WARN] ${context}: Attempted update by user from wrong tenant.`);
        return { success: false, message: 'Authorization Error: You do not have permission to update this account.' };
    }

    // Balance is NOT updated here; it's managed by transactions
    const updatedAccount = await prisma.account.update({
      where: { id }, // ID is globally unique, tenant check is for authorization
      data: updateData,
    });

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: `Account "${updateData.name}" (Code: ${updateData.code}) updated successfully.` };
  } catch (error: unknown) {
     if (checkPrismaInitError(error, context)) {
         return { success: false, message: 'Database Connection Error during account update.', error: 'Initialization Error' };
     }

     console.error(`[DB_ERROR] ${context}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle specific known errors
        if (error.code === 'P2025') return { success: false, message: 'Database Error: Account not found.', error: error.code };
        if (error.code === 'P2002') {
           const target = (error.meta?.target as string[])?.join(', ') || 'field';
           // Specific feedback for duplicate code within the tenant
            if (target.includes('code') && target.includes('tenantId')) {
                return {
                    success: false, message: `Database Error: Account code "${updateData.code}" is already in use by this tenant.`, error: error.code,
                    fieldErrors: { code: [`Account code "${updateData.code}" is already in use by this tenant.`] }
                };
            }
           return { success: false, message: `Database Error: A unique constraint failed on ${target}.`, error: error.code };
        }
      }
     return { success: false, message: 'Database Error: Failed to update account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Delete Account for the current tenant ---
export async function deleteAccount(id: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot delete account.' };
   }
   const context = `deleteAccount (ID: ${id}, Tenant: ${tenantId})`;

  // Basic ID validation
  if (!id || typeof id !== 'string' || id.length < 5) { // Basic CUID length check
     console.error(`[VALIDATION_ERROR] ${context}: Invalid Account ID provided.`);
     return { success: false, message: 'Invalid Account ID provided.' };
  }

  try {
    // IMPORTANT: Check if the account has a non-zero balance or related transactions before deleting.
    // Prisma's 'Restrict' onDelete will prevent deletion if relations exist (Expenses, JournalEntryLines).
    // You might want a soft delete (setting isActive=false) instead of hard delete.
    const account = await prisma.account.findUnique({
        where: { id },
        // Include tenantId to verify ownership
        select: { balance: true, _count: { select: { expenses: true, journalEntryLines: true }}, tenantId: true }
    });

    // If account doesn't exist
    if (!account) {
         return { success: false, message: 'Account not found.', error: 'P2025' };
    }

    // Verify tenant ownership
    if (account.tenantId !== tenantId) {
        console.warn(`[AUTH_WARN] ${context}: Attempted delete by user from wrong tenant.`);
        return { success: false, message: 'Authorization Error: You do not have permission to delete this account.' };
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
     if (checkPrismaInitError(error, context)) {
         return { success: false, message: 'Database Connection Error during account deletion.', error: 'Initialization Error' };
     }

     console.error(`[DB_ERROR] ${context}:`, error);
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

// --- Get Account by ID (ensuring it belongs to the current tenant) ---
export async function getAccountById(id: string): Promise<AccountSchema | null> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       console.error("[ACTION_ERROR] Tenant ID not found in getAccountById.");
       return null; // Or throw
   }
   const context = `getAccountById (ID: ${id}, Tenant: ${tenantId})`;

  if (!id) return null;
  try {
    const account = await prisma.account.findUnique({
        where: { id },
    });

    if (!account || account.tenantId !== tenantId) {
        return null; // Return null if not found or doesn't belong to tenant
    }

    // Parse the fetched data using the main schema
    return accountSchema.parse({
        ...account,
        description: account.description ?? undefined,
        balance: account.balance?.toNumber(),
    });
  } catch (error: unknown) {
      if (checkPrismaInitError(error, context)) {
            console.warn(`[DB_WARN] Database connection failed while fetching account ${id} for tenant ${tenantId}. Returning null.`);
       } else {
           console.error(`[ACTION_ERROR] Error fetching account ${id} for tenant ${tenantId}:`, error);
           console.warn(`[DB_WARN] Returning null for account ${id} (tenant ${tenantId}) due to unexpected error.`);
       }
    return null; // Return null on any error
  }
}
