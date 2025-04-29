
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { journalEntrySchema, journalEntryFormSchema, JournalEntrySchema, journalEntryLineSchema } from '@/lib/schemas/journalEntry';
import { Prisma } from '@prisma/client';
import { accountSchema } from '@/lib/schemas/account'; // Import for parsing relations
import { getTenantId, getUserId } from '@/lib/utils/tenant'; // Helper to get tenant/user ID

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

// --- Get Journal Entries for the current tenant ---
export async function getJournalEntries(): Promise<JournalEntrySchema[]> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       console.error("[ACTION_ERROR] Tenant ID not found in getJournalEntries.");
       return [];
   }

  try {
    const entries = await prisma.journalEntry.findMany({
        where: { tenantId: tenantId }, // Filter by tenant
        orderBy: { entryDate: 'desc' },
        include: {
            lines: {
                include: { account: { select: { id: true, name: true, code: true } } }
            },
            // createdBy: { select: { id: true, name: true, email: true } } // Optional: Include user info
        }
    });
    // Validate structure - might need careful handling of nested validation
     return entries.map(entry => journalEntrySchema.parse({
        ...entry,
        entryDate: new Date(entry.entryDate),
        reference: entry.reference ?? undefined, // Handle null from DB
        lines: entry.lines.map(line => journalEntryLineSchema.parse({
            ...line,
            amount: line.amount.toNumber(), // Convert Decimal
            description: line.description ?? undefined, // Handle null
            account: line.account // Already selected fields
        }))
        // createdBy: entry.createdBy ? userSchema.parse(entry.createdBy) : undefined, // Parse user if included
    }));
  } catch (error) {
     if (checkPrismaInitError(error, `getJournalEntries (Tenant: ${tenantId})`)) {
          console.warn(`Returning empty journal entries for tenant ${tenantId} due to DB connection issue.`);
     } else {
        console.error(`[ACTION_ERROR] Error fetching journal entries for tenant ${tenantId}:`, error);
     }
    return [];
  }
}

// --- Add Journal Entry for the current tenant ---
export async function addJournalEntry(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  const userId = await getUserId(); // Get current user ID

  if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
  // Decide if userId is mandatory for creating entries
  // if (!userId) return { success: false, message: 'User ID not found.' };

  const rawData = {
      entryDate: formData.get('entryDate'),
      description: formData.get('description'),
      reference: formData.get('reference'),
      lines: formData.get('lines') // Expecting JSON string
  };

  // 1. Validate basic fields
  const basicValidation = journalEntryFormSchema.omit({ lines: true }).safeParse({
      entryDate: rawData.entryDate ? new Date(rawData.entryDate as string) : undefined,
      description: rawData.description,
      reference: rawData.reference || undefined,
  });

   if (!basicValidation.success) {
        const fieldErrors = basicValidation.error.flatten().fieldErrors;
        console.error(`[VALIDATION_ERROR] addJournalEntry (basic, Tenant: ${tenantId}):`, fieldErrors);
        return { success: false, message: 'Basic entry validation failed.', error: "Validation Error", fieldErrors };
    }

  // 2. Parse and validate lines
   let parsedLines: any[];
   try {
     if (!rawData.lines) throw new Error("Journal entry lines are missing.");
     parsedLines = JSON.parse(rawData.lines as string);
     if (!Array.isArray(parsedLines)) throw new Error("Invalid lines format.");
   } catch (error) {
     console.error(`[VALIDATION_ERROR] addJournalEntry (lines JSON, Tenant: ${tenantId}):`, error);
     return { success: false, message: 'Invalid journal entry lines data format.', error: "Validation Error", fieldErrors: { lines: ['Invalid lines format or missing lines.'] } };
   }

   // Validate each line, check debit/credit balance, and verify account ownership
   const validatedLinesData: { accountId: string; type: 'Debit' | 'Credit'; amount: number; description?: string }[] = [];
   let totalDebits = 0;
   let totalCredits = 0;
   const lineErrors: string[] = [];
   const accountIdsToCheck: string[] = [];

   for (let i = 0; i < parsedLines.length; i++) {
       const line = parsedLines[i];
       const lineValidation = journalEntryLineSchema.omit({ id: true, journalEntryId: true, createdAt: true, account: true }).safeParse({ // Exclude related objects
           accountId: line.accountId,
           type: line.type,
           amount: parseFloat(line.amount),
           description: line.description || undefined,
       });

       if (!lineValidation.success) {
           const errors = lineValidation.error.flatten().fieldErrors;
           Object.values(errors).flat().forEach(errMsg => lineErrors.push(`Line ${i + 1}: ${errMsg}`));
       } else {
           const validLine = lineValidation.data;
           validatedLinesData.push(validLine);
           accountIdsToCheck.push(validLine.accountId); // Collect account IDs to check ownership
           if (validLine.type === 'Debit') totalDebits += validLine.amount;
           else totalCredits += validLine.amount;
       }
   }

    if (lineErrors.length > 0) {
        console.error(`[VALIDATION_ERROR] addJournalEntry (lines, Tenant: ${tenantId}):`, lineErrors);
        return { success: false, message: 'Journal entry lines validation failed.', error: "Validation Error", fieldErrors: { lines: lineErrors } };
    }

   // Check balance
    if (Math.abs(totalDebits - totalCredits) >= 0.01) { // Use tolerance
         console.error(`[VALIDATION_ERROR] addJournalEntry (balance, Tenant: ${tenantId}): Debits !== Credits`);
         return { success: false, message: 'Validation failed: Total debits must equal total credits.', error: "Validation Error", fieldErrors: { lines: ['Total debits do not equal total credits.'] } };
    }

    // Verify all accounts belong to the tenant
    try {
        const accounts = await prisma.account.findMany({
            where: { id: { in: accountIdsToCheck }, tenantId: tenantId },
            select: { id: true }
        });
        if (accounts.length !== accountIdsToCheck.length) {
             console.error(`[VALIDATION_ERROR] addJournalEntry (account ownership, Tenant: ${tenantId}): Mismatch found.`);
             return { success: false, message: 'One or more selected accounts do not belong to this tenant.', error: "Validation Error", fieldErrors: { lines: ['Invalid account used in lines.'] } };
        }
    } catch (error) {
        console.error(`[DB_ERROR] Error validating account ownership for tenant ${tenantId}:`, error);
        return { success: false, message: 'Database error during account validation.' };
    }

  // --- Transaction Logic ---
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Journal Entry header
      const newEntry = await tx.journalEntry.create({
        data: {
          tenantId: tenantId, // Set tenant ID
          entryDate: basicValidation.data.entryDate,
          description: basicValidation.data.description,
          reference: basicValidation.data.reference,
          createdById: userId, // Set creator user ID if available
        },
      });

      // 2. Create the Journal Entry Lines
      await tx.journalEntryLine.createMany({
        data: validatedLinesData.map(line => ({
          journalEntryId: newEntry.id,
          accountId: line.accountId,
          type: line.type,
          amount: line.amount,
          description: line.description,
        })),
      });

      // 3. Update Account Balances (Crucial Step!)
      for (const line of validatedLinesData) {
         const account = await tx.account.findUnique({ where: { id: line.accountId }, select: { type: true }});
         if (!account) throw new Error(`Account ${line.accountId} not found during balance update.`);

          // Determine balance impact based on account type and entry type
         let change = 0;
         if (line.type === 'Debit') {
             // Debits increase Assets & Expenses, decrease Liabilities, Equity, Revenue
             if (account.type === 'Asset' || account.type === 'Expense') change = line.amount;
             else change = -line.amount;
         } else { // Credit
             // Credits decrease Assets & Expenses, increase Liabilities, Equity, Revenue
             if (account.type === 'Asset' || account.type === 'Expense') change = -line.amount;
             else change = line.amount;
         }

         // Only update balance for Asset, Liability, Equity accounts
         if (account.type === 'Asset' || account.type === 'Liability' || account.type === 'Equity') {
             await tx.account.update({
               where: { id: line.accountId },
               data: { balance: { increment: change } },
             });
         }
      }

      return newEntry; // Return the created entry header
    });

    // Revalidate relevant paths
    revalidatePath('/journal-entries');
    revalidatePath('/chart-of-accounts'); // Account balances changed
    revalidatePath('/reports'); // Reports will be affected
    revalidatePath('/dashboard');

    return { success: true, message: 'Journal entry created successfully.', data: result };

  } catch (error: unknown) {
    if (checkPrismaInitError(error, `addJournalEntry Transaction (Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to create journal entry.', error: 'Initialization Error' };
    }

    console.error(`[DB_ERROR] Failed to create journal entry transaction for tenant ${tenantId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Handle specific errors like invalid foreign keys (accountId - less likely due to pre-check)
         if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('accountId')) {
             return { success: false, message: 'Database Error: One or more accounts selected do not exist.', error: error.code };
         }
     } else if (error instanceof Error && error.message.includes("not found during balance update")) {
         return { success: false, message: error.message, error: "Transaction Error" };
     }
    return {
        success: false,
        message: 'Database Error: Failed to create journal entry.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}


// --- Update Journal Entry ---
export async function updateJournalEntry(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const entryId = formData.get('id') as string;
   if (!entryId) return { success: false, message: "Entry ID missing." };

    // Verify entry belongs to the tenant
    try {
        const entry = await prisma.journalEntry.findUnique({ where: { id: entryId }, select: { tenantId: true } });
        if (!entry) return { success: false, message: 'Journal entry not found.' };
        if (entry.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
        return { success: false, message: 'Database error verifying entry ownership.' };
    }

  // TODO: Implement complex update logic including:
  // 1. Validation of basic fields and lines (similar to addJournalEntry).
  // 2. Validation that all accounts belong to the tenant.
  // 3. Transaction:
  //    a. Fetch the *old* lines of the journal entry.
  //    b. *Revert* the balance changes made by the *old* lines (opposite debit/credit logic).
  //    c. Delete the *old* lines.
  //    d. Create the *new* lines based on validated form data.
  //    e. *Apply* the balance changes for the *new* lines.
  //    f. Update the journal entry header (date, description, reference).
   console.warn("Update Journal Entry - Not fully implemented yet (Requires Complex Transaction Logic)");
  return { success: false, message: 'Update Journal Entry - Not Implemented Yet' };
}

// --- Delete Journal Entry ---
export async function deleteJournalEntry(id: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!id) return { success: false, message: "Entry ID missing." };

   // --- Transaction Logic ---
    try {
         const result = await prisma.$transaction(async (tx) => {
             // 1. Find the entry and verify ownership, include lines for balance reversal
             const entry = await tx.journalEntry.findUnique({
                 where: { id },
                 include: { lines: { select: { accountId: true, type: true, amount: true, account: { select: { type: true } } } } } // Include account type for reversal logic
             });
             if (!entry) throw new Error('Journal entry not found.');
             if (entry.tenantId !== tenantId) throw new Error('Authorization Error: Cannot delete this entry.');

             // 2. Revert Account Balance Changes
             for (const line of entry.lines) {
                 if (!line.account) throw new Error(`Account details missing for line with accountId ${line.accountId}`); // Should not happen with include

                 let change = 0;
                 // Reverse the logic from addJournalEntry
                 if (line.type === 'Debit') {
                     // Deleting a Debit: Decreases Assets/Expenses, Increases Liabilities/Equity/Revenue
                     if (line.account.type === 'Asset' || line.account.type === 'Expense') change = -line.amount.toNumber();
                     else change = line.amount.toNumber();
                 } else { // Credit
                     // Deleting a Credit: Increases Assets/Expenses, Decreases Liabilities/Equity/Revenue
                     if (line.account.type === 'Asset' || line.account.type === 'Expense') change = line.amount.toNumber();
                     else change = -line.amount.toNumber();
                 }

                 // Only update balance for Asset, Liability, Equity accounts
                 if (line.account.type === 'Asset' || line.account.type === 'Liability' || line.account.type === 'Equity') {
                     await tx.account.update({
                         where: { id: line.accountId },
                         data: { balance: { increment: change } },
                     });
                 }
             }

             // 3. Delete the Journal Entry (lines will be cascade deleted)
             await tx.journalEntry.delete({ where: { id } });

             return true; // Indicate success
         });

        // Revalidate relevant paths
        revalidatePath('/journal-entries');
        revalidatePath('/chart-of-accounts'); // Balances changed
        revalidatePath('/reports');
        revalidatePath('/dashboard');

        return { success: true, message: 'Journal entry deleted successfully.' };

    } catch (error: unknown) {
         if (checkPrismaInitError(error, `deleteJournalEntry Transaction (${id}, Tenant: ${tenantId})`)) {
             return { success: false, message: 'Database Connection Error. Failed to delete entry.', error: 'Initialization Error' };
         }
         console.error(`[DB_ERROR] Failed to delete journal entry ${id} for tenant ${tenantId}:`, error);
         if (error instanceof Error && (error.message === 'Journal entry not found.' || error.message.startsWith('Authorization Error'))) {
              return { success: false, message: error.message };
          }
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             // Should be caught by initial findUnique, but good backup
             return { success: false, message: 'Record not found during deletion process.', error: error.code };
         }
         return { success: false, message: 'Database Error: Failed to delete journal entry.', error: error instanceof Error ? error.message : String(error) };
    }
}
