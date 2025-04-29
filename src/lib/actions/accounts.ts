
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { accountSchema, AccountSchema } from '@/lib/schemas/account';
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
        description: account.description ?? undefined // Map null to undefined for zod optional
    }));
  } catch (error) {
    console.error("[ACTION_ERROR] Error fetching accounts:", error);
    // In a real app, handle this error more gracefully (e.g., return specific error object or throw)
    // Returning empty array for now to avoid breaking the page, but ideally, signal the error upstream.
    return [];
  }
}

// --- Add New Account ---
export async function addAccount(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = accountSchema.omit({id: true}).safeParse({ // Omit ID for creation
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || undefined, // Map empty string to undefined for optional field
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

  const { code, name, type, description } = validatedFields.data;

  try {
    // No need to explicitly check for existing code if the DB schema has a unique constraint.
    // Prisma will throw P2002 error which we can catch.
    // const existingAccount = await prisma.account.findUnique({ where: { code } });
    // if (existingAccount) {
    //   return { success: false, message: `Account code "${code}" already exists.` };
    // }

    const newAccount = await prisma.account.create({
      data: {
        code,
        name,
        type,
        description,
      },
    });

    revalidatePath('/chart-of-accounts'); // Update the cache for the accounts page
    return { success: true, message: `Account "${name}" (Code: ${code}) created successfully.` };

  } catch (error: unknown) {
    console.error("[DB_ERROR] Failed to create account:", error);

    // Handle specific Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (e.g., duplicate account code)
      if (error.code === 'P2002') {
         const target = (error.meta?.target as string[])?.join(', ') || 'field';
        if (target.includes('code')) {
            return {
                success: false,
                message: `Database Error: Account code "${code}" already exists. Please use a unique code.`,
                error: error.code,
                 fieldErrors: { code: [`Account code "${code}" already exists.`] }
            };
        }
         // Handle other unique constraints if added later
         return {
            success: false,
            message: `Database Error: A unique constraint failed on ${target}.`,
            error: error.code
         };
      }
      // Add handling for other relevant Prisma error codes if necessary
    }

    // Generic database error
    return {
        success: false,
        message: 'Database Error: Failed to create account due to an unexpected issue.',
        error: error instanceof Error ? error.message : String(error)
     };
  }
}

// --- Update Account ---
const updateAccountSchema = accountSchema.extend({
  id: z.string().cuid({ message: "Invalid account ID." }), // Ensure ID is provided and is a valid CUID
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
  const rawData = Object.fromEntries(formData.entries());

   const validatedFields = updateAccountSchema.safeParse({
    id: rawData.id,
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || undefined, // Map empty string to undefined
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error("[VALIDATION_ERROR] updateAccount:", fieldErrors);
    return {
      success: false,
      message: 'Validation failed. Please check the form fields.',
      error: "Validation Error",
      fieldErrors: fieldErrors,
    };
  }

  const { id, code, name, type, description } = validatedFields.data;

  try {
     // Prisma will handle the unique constraint check on 'code' during update
     // We just need to catch the P2002 error if it occurs

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: {
        code,
        name,
        type,
        description,
      },
    });

    revalidatePath('/chart-of-accounts');
    return { success: true, message: `Account "${name}" (Code: ${code}) updated successfully.` };
  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to update account:", error);

     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Record to update not found
        if (error.code === 'P2025') {
            return { success: false, message: 'Database Error: Account not found for update.', error: error.code };
        }
        // Unique constraint violation (e.g., duplicate account code)
        if (error.code === 'P2002') {
           const target = (error.meta?.target as string[])?.join(', ') || 'field';
            if (target.includes('code')) {
                return {
                    success: false,
                    message: `Database Error: Account code "${code}" is already used by another account.`,
                    error: error.code,
                    fieldErrors: { code: [`Account code "${code}" is already in use.`] }
                };
            }
           return { success: false, message: `Database Error: A unique constraint failed on ${target}.`, error: error.code };
        }
        // Add handling for other relevant Prisma error codes if necessary
      }

     return {
        success: false,
        message: 'Database Error: Failed to update account due to an unexpected issue.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Delete Account ---
export async function deleteAccount(id: string): Promise<ActionResult> {
  if (!id || typeof id !== 'string' || id.length < 5) { // Basic check for valid ID format (CUID is longer)
     return { success: false, message: 'Invalid Account ID provided for deletion.' };
  }

  try {
    // Attempt to delete the account
    await prisma.account.delete({
      where: { id },
    });

    revalidatePath('/chart-of-accounts');
    return { success: true, message: 'Account deleted successfully.' };

  } catch (error: unknown) {
     console.error("[DB_ERROR] Failed to delete account:", error);

     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Record to delete not found
        if (error.code === 'P2025') {
            return { success: false, message: 'Account not found. It may have already been deleted.', error: error.code };
        }
        // Foreign key constraint failed (e.g., linked expenses exist)
        if (error.code === 'P2003') {
            // Trying to identify which relation caused the constraint failure might require checking error.meta.field_name
            // For simplicity, give a general message.
            const fieldName = (error.meta?.field_name as string) || 'related records';
            console.warn(`Attempted to delete account ${id} which is linked via ${fieldName}`);
           return {
                success: false,
                message: 'Cannot delete account because it is still linked to other records (e.g., Expenses). Please remove the links first.',
                error: error.code
            };
        }
        // Add handling for other relevant Prisma error codes if necessary
      }

     return {
        success: false,
        message: 'Database Error: Failed to delete account due to an unexpected issue.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Get Account by ID (Example - remains the same) ---
export async function getAccountById(id: string): Promise<AccountSchema | null> {
  if (!id) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id } });
    return account ? accountSchema.parse({
        ...account,
        description: account.description ?? undefined
    }) : null;
  } catch (error) {
     console.error(`[ACTION_ERROR] Error fetching account with ID ${id}:`, error);
    return null; // Or throw / return error object
  }
}
