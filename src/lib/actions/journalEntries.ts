
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { journalEntrySchema, journalEntryFormSchema, JournalEntrySchema, journalEntryLineSchema } from '@/lib/schemas/journalEntry';
import { Prisma } from '@prisma/client';

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Get Journal Entries ---
export async function getJournalEntries(): Promise<JournalEntrySchema[]> {
  try {
    const entries = await prisma.journalEntry.findMany({
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
        lines: entry.lines.map(line => journalEntryLineSchema.parse({
            ...line,
            amount: line.amount.toNumber(), // Convert Decimal
            account: line.account // Already selected fields
        }))
        // createdBy: entry.createdBy ? userSchema.parse(entry.createdBy) : undefined, // Parse user if included
    }));
    // return entries as JournalEntrySchema[]; // Cast if validation is complex
  } catch (error) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching journal entries:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library. Ensure OpenSSL is installed. Returning empty list.");
         } else {
              console.error("Database connection failed. Returning empty list.");
         }
        return [];
    }
    console.error("[ACTION_ERROR] Error fetching journal entries:", error);
    return [];
  }
}

// --- Add Journal Entry ---
export async function addJournalEntry(formData: FormData): Promise<ActionResult> {
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
        console.error("[VALIDATION_ERROR] addJournalEntry (basic):", fieldErrors);
        return { success: false, message: 'Basic entry validation failed.', error: "Validation Error", fieldErrors };
    }

  // 2. Parse and validate lines
   let parsedLines: any[];
   try {
     if (!rawData.lines) throw new Error("Journal entry lines are missing.");
     parsedLines = JSON.parse(rawData.lines as string);
     if (!Array.isArray(parsedLines)) throw new Error("Invalid lines format.");
   } catch (error) {
     console.error("[VALIDATION_ERROR] addJournalEntry (lines JSON parsing):", error);
     return { success: false, message: 'Invalid journal entry lines data format.', error: "Validation Error", fieldErrors: { lines: ['Invalid lines format or missing lines.'] } };
   }

   // Validate each line and check debit/credit balance
   const validatedLinesData: { accountId: string; type: 'Debit' | 'Credit'; amount: number; description?: string }[] = [];
   let totalDebits = 0;
   let totalCredits = 0;
   const lineErrors: string[] = [];

   for (let i = 0; i < parsedLines.length; i++) {
       const line = parsedLines[i];
       const lineValidation = journalEntryLineSchema.omit({ id: true, journalEntryId: true, createdAt: true }).safeParse({
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
           if (validLine.type === 'Debit') totalDebits += validLine.amount;
           else totalCredits += validLine.amount;
       }
   }

    if (lineErrors.length > 0) {
        console.error("[VALIDATION_ERROR] addJournalEntry (lines validation):", lineErrors);
        return { success: false, message: 'Journal entry lines validation failed.', error: "Validation Error", fieldErrors: { lines: lineErrors } };
    }

   // Check balance
    if (Math.abs(totalDebits - totalCredits) >= 0.01) { // Use tolerance
         console.error("[VALIDATION_ERROR] addJournalEntry (balance): Debits !== Credits");
         return { success: false, message: 'Validation failed: Total debits must equal total credits.', error: "Validation Error", fieldErrors: { lines: ['Total debits do not equal total credits.'] } };
    }

  // --- Transaction Logic ---
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Journal Entry header
      const newEntry = await tx.journalEntry.create({
        data: {
          entryDate: basicValidation.data.entryDate,
          description: basicValidation.data.description,
          reference: basicValidation.data.reference,
          // createdById: userId, // TODO: Get current user ID if implementing auth
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
    console.error("[DB_ERROR] Failed to create journal entry transaction:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Handle specific errors like invalid foreign keys (accountId)
         if (error.code === 'P2003' && (error.meta?.field_name as string)?.includes('accountId')) {
             return { success: false, message: 'Database Error: One or more accounts selected do not exist.', error: error.code };
         }
     } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during journal entry creation:", error.message);
         if (error.message.includes('libssl')) {
              console.error("DATABASE CONNECTION FAILED: Missing `libssl` system library.");
         }
        return {
            success: false,
            message: 'Database Connection Error. Failed to create journal entry.',
            error: 'Initialization Error'
        };
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
  // Placeholder: Very complex due to needing to revert old balance changes and apply new ones transactionally.
   console.log("Update journal entry action called (Not Implemented)", Object.fromEntries(formData.entries()));
   const entryId = formData.get('id') as string;
   if (!entryId) return { success: false, message: "Entry ID missing." };
  return { success: false, message: 'Update Journal Entry - Not Implemented Yet (Requires Complex Transaction Logic)' };
}

// --- Delete Journal Entry ---
export async function deleteJournalEntry(id: string): Promise<ActionResult> {
  // Placeholder: Requires reverting account balance changes transactionally.
  console.log("Delete journal entry action called (Not Implemented)", id);
   if (!id) return { success: false, message: "Entry ID missing." };
  return { success: false, message: 'Delete Journal Entry - Not Implemented Yet (Requires Complex Transaction Logic)' };
}
