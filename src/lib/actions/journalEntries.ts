
'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { journalEntrySchema, journalEntryFormSchema, JournalEntrySchema, journalEntryLineSchema, entryTypes } from '@/lib/schemas/journalEntry';
import { accountSchema } from '@/lib/schemas/account';
import { getTenantId, getUserId } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type JournalEntryDocument = Omit<JournalEntrySchema, 'id' | 'lines' | 'createdById'> & {
    _id?: ObjectId;
    tenantId: string;
    createdById?: ObjectId | null; // Store user ID if available
    createdAt?: Date;
    updatedAt?: Date;
};
type JournalEntryLineDocument = Omit<JournalEntryLineSchema, 'id' | 'journalEntryId' | 'accountId'> & {
     _id?: ObjectId;
     journalEntryId: ObjectId;
     accountId: ObjectId;
      // No tenantId needed if always accessed via JournalEntry
 };
type AccountInfo = { _id: ObjectId; name: string; code: string; type: typeof accountSchema.shape.type._def.values[number] }; // More specific type

// Helper to get collections
async function getJournalEntriesCollection(): Promise<Collection<JournalEntryDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<JournalEntryDocument>('journalEntries');
}
async function getJournalEntryLinesCollection(): Promise<Collection<JournalEntryLineDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<JournalEntryLineDocument>('journalEntryLines');
}
async function getAccountsCollection(): Promise<Collection<any>> { // Use 'any' or define AccountDocument
  const { db } = await connectToDatabase();
  return db.collection('accounts');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get Journal Entries for the current tenant ---
export async function getJournalEntries(): Promise<JournalEntrySchema[]> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       console.error("[ACTION_ERROR] Tenant ID not found in getJournalEntries.");
       return [];
   }
   const context = `getJournalEntries (Tenant: ${tenantId})`;

  try {
    const journalEntriesCollection = await getJournalEntriesCollection();
    // Use aggregation to fetch entries and their lines with account info
    const entriesCursor = journalEntriesCollection.aggregate([
        { $match: { tenantId: tenantId } },
        { $sort: { entryDate: -1 } },
        {
            $lookup: { // Join lines
                from: 'journalEntryLines',
                localField: '_id',
                foreignField: 'journalEntryId',
                as: 'linesData',
                // Nested pipeline to join account info within lines
                pipeline: [
                    {
                        $lookup: {
                            from: 'accounts',
                            localField: 'accountId',
                            foreignField: '_id',
                            as: 'accountInfo'
                        }
                    },
                    { $unwind: { path: '$accountInfo', preserveNullAndEmptyArrays: true } }, // Unwind the single account
                    { // Project necessary line fields + account details
                       $project: {
                            _id: 1, journalEntryId: 1, accountId: 1, type: 1, amount: 1, description: 1, createdAt: 1,
                            account: { // Create the nested account object
                                id: '$accountInfo._id',
                                name: '$accountInfo.name',
                                code: '$accountInfo.code',
                                type: '$accountInfo.type'
                            }
                       }
                    }
                ]
            }
        },
         // Optional: Lookup createdBy user info
        // {
        //     $lookup: { from: 'users', localField: 'createdById', foreignField: '_id', as: 'creatorInfo' }
        // },
        {
             $project: { // Project final entry shape
                _id: 1, entryDate: 1, description: 1, reference: 1, createdAt: 1, updatedAt: 1, createdById: 1,
                lines: '$linesData',
                // createdBy: { $arrayElemAt: ['$creatorInfo', 0] }
             }
        }

    ]);

    const entriesArray = await entriesCursor.toArray();

    // Map and parse data
     return entriesArray.map(entry => journalEntrySchema.parse({
        ...entry,
        id: entry._id?.toHexString(),
        createdById: entry.createdById?.toHexString() ?? undefined,
        entryDate: new Date(entry.entryDate),
        reference: entry.reference ?? undefined,
        lines: entry.lines.map((line: any) => journalEntryLineSchema.parse({
            id: line._id?.toHexString(),
            journalEntryId: line.journalEntryId?.toHexString(),
            accountId: line.accountId?.toHexString(),
            type: line.type,
            amount: line.amount, // Assuming number
            description: line.description ?? undefined,
            account: line.account ? { // Parse the projected account object
                id: line.account.id?.toHexString(),
                name: line.account.name,
                code: line.account.code,
                type: line.account.type,
                 // Add other fields if needed and projected
            } : undefined,
        })),
        // createdBy: entry.createdBy ? userSchema.parse(...) : undefined,
    }));
  } catch (error) {
    console.error(`[ACTION_ERROR] ${context}:`, error);
    console.warn(`[DB_WARN] Returning empty journal entries list for tenant ${tenantId} due to unexpected error.`);
    return [];
  }
}

// --- Add Journal Entry for the current tenant ---
export async function addJournalEntry(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  const userIdString = await getUserId(); // Get current user ID as string

  if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
  const context = `addJournalEntry (Tenant: ${tenantId})`;

   let userObjectId: ObjectId | undefined | null = undefined;
   if (userIdString) {
       try { userObjectId = new ObjectId(userIdString); } catch { /* handle invalid user ID format if needed */ }
   }

  const rawData = { /* ... extract from formData ... */ };

  // --- 1. Validate Basic Fields ---
  const basicValidation = journalEntryFormSchema.omit({ lines: true }).safeParse({ /* ... parse rawData ... */ });
   if (!basicValidation.success) { /* handle error */ }

  // --- 2. Parse and Validate Lines ---
   let parsedLines: any[];
   try { /* ... parse rawData.lines JSON ... */ } catch (error) { /* handle JSON error */ }

   const validatedLinesData: Omit<JournalEntryLineDocument, '_id' | 'journalEntryId'>[] = [];
   let totalDebits = 0;
   let totalCredits = 0;
   const lineErrors: string[] = [];
   const accountIdsToCheck: ObjectId[] = [];

   for (let i = 0; i < parsedLines.length; i++) {
       const line = parsedLines[i];
       const lineValidation = journalEntryLineSchema.omit({ id: true, journalEntryId: true, createdAt: true, account: true }).safeParse({ /* ... parse line ... */ });

       if (!lineValidation.success) { /* collect errors */ }
       else {
           const validLine = lineValidation.data;
           let accountObjectId: ObjectId;
           try {
                accountObjectId = new ObjectId(validLine.accountId);
           } catch {
               lineErrors.push(`Line ${i + 1}: Invalid Account ID format.`);
               continue;
           }

           validatedLinesData.push({
               accountId: accountObjectId, // Store ObjectId
               type: validLine.type,
               amount: validLine.amount,
               description: validLine.description,
           });
           accountIdsToCheck.push(accountObjectId); // Collect for bulk validation
           if (validLine.type === 'Debit') totalDebits += validLine.amount;
           else totalCredits += validLine.amount;
       }
   }

    if (lineErrors.length > 0) { /* handle line errors */ }
    if (Math.abs(totalDebits - totalCredits) >= 0.01) { /* handle imbalance error */ }

    // --- 3. Verify Account Ownership (Bulk Check) ---
    try {
        const accountsCollection = await getAccountsCollection();
        const validAccountsCount = await accountsCollection.countDocuments({ _id: { $in: accountIdsToCheck }, tenantId: tenantId });
        if (validAccountsCount !== accountIdsToCheck.length) {
             console.error(`[VALIDATION_ERROR] ${context} (account ownership): Mismatch found.`);
             return { success: false, message: 'One or more selected accounts do not belong to this tenant.', error: "Validation Error", fieldErrors: { lines: ['Invalid account used in lines.'] } };
        }
        // Optional: Fetch account types here if needed for complex validation before transaction
    } catch (error) {
        console.error(`[DB_ERROR] Error validating account ownership in ${context}:`, error);
        return { success: false, message: 'Database error during account validation.' };
    }


  // --- 4. Transaction Logic ---
  const { db, client: mongoClient } = await connectToDatabase(); // Get client for session
  const session = mongoClient.startSession();
  try {
    let createdEntryData: any = null; // To store result

    await session.withTransaction(async () => {
      const journalEntriesCollection = db.collection<JournalEntryDocument>('journalEntries');
      const journalEntryLinesCollection = db.collection<JournalEntryLineDocument>('journalEntryLines');
      const accountsCollection = db.collection('accounts');

      // 1. Create the Journal Entry header
      const newEntryResult = await journalEntriesCollection.insertOne({
        tenantId: tenantId,
        entryDate: basicValidation.data.entryDate,
        description: basicValidation.data.description,
        reference: basicValidation.data.reference,
        createdById: userObjectId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { session });

      if (!newEntryResult.insertedId) throw new Error("Failed to insert journal entry header.");
      const newEntryId = newEntryResult.insertedId;

      // 2. Create the Journal Entry Lines
      if (validatedLinesData.length > 0) {
          const linesToInsert = validatedLinesData.map(line => ({ ...line, journalEntryId: newEntryId }));
          await journalEntryLinesCollection.insertMany(linesToInsert, { session });
      }


      // 3. Update Account Balances (Refetch accounts within transaction for type)
      const accountsInfo = await accountsCollection.find(
          { _id: { $in: accountIdsToCheck } },
          { projection: { _id: 1, type: 1 }, session }
      ).toArray();
      const accountTypeMap = new Map(accountsInfo.map(acc => [acc._id.toHexString(), acc.type]));

      for (const line of validatedLinesData) {
         const accountType = accountTypeMap.get(line.accountId.toHexString());
         if (!accountType) throw new Error(`Account type for ${line.accountId} not found during balance update.`);

         let change = 0;
         if (line.type === 'Debit') {
             if (accountType === 'Asset' || accountType === 'Expense') change = line.amount;
             else change = -line.amount;
         } else { // Credit
             if (accountType === 'Asset' || accountType === 'Expense') change = -line.amount;
             else change = line.amount;
         }

         // Only update balance for Asset, Liability, Equity accounts
         if (accountType === 'Asset' || accountType === 'Liability' || accountType === 'Equity') {
             const updateResult = await accountsCollection.updateOne(
               { _id: line.accountId },
               { $inc: { balance: change } }, // Use $inc for atomic update
               { session }
             );
             if (updateResult.matchedCount === 0) throw new Error(`Account ${line.accountId} not found for balance update.`);
         }
      }
      // Store data to return outside transaction
      createdEntryData = { id: newEntryId.toHexString() };
    }); // End Transaction

    await session.endSession();

    // Revalidate relevant paths
    revalidatePath('/journal-entries');
    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    revalidatePath('/dashboard');

    return { success: true, message: 'Journal entry created successfully.', data: createdEntryData };

  } catch (error: unknown) {
    await session.endSession(); // Ensure session is closed on error
    console.error(`[DB_ERROR] ${context} Transaction:`, error);
    return {
        success: false,
        message: 'Database Transaction Error: Failed to create journal entry.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}


// --- Update Journal Entry ---
export async function updateJournalEntry(formData: FormData): Promise<ActionResult> {
  // Similar structure to addJournalEntry, but with more complex transaction:
  // 1. Validate input and relations.
  // 2. Start Transaction.
  // 3. Find OLD entry and its lines, verify ownership.
  // 4. Revert OLD balance changes.
  // 5. Delete OLD lines.
  // 6. Insert NEW lines.
  // 7. Apply NEW balance changes.
  // 8. Update entry header.
  // 9. Commit Transaction.
  // 10. Revalidate paths.
   console.warn("Update Journal Entry - MongoDB implementation requires careful transaction logic for reverting/applying balances.");
   return { success: false, message: 'Update Journal Entry - Not Implemented Yet (MongoDB)' };
}

// --- Delete Journal Entry ---
export async function deleteJournalEntry(idString: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!idString) return { success: false, message: "Entry ID missing." };
   const context = `deleteJournalEntry (ID: ${idString}, Tenant: ${tenantId})`;

    let entryId: ObjectId;
    try { entryId = new ObjectId(idString); }
    catch { return { success: false, message: 'Invalid Entry ID format.' }; }

   // --- Transaction Logic ---
    const { db, client: mongoClient } = await connectToDatabase();
    const session = mongoClient.startSession();
    try {
         await session.withTransaction(async () => {
             const journalEntriesCollection = db.collection<JournalEntryDocument>('journalEntries');
             const journalEntryLinesCollection = db.collection<JournalEntryLineDocument>('journalEntryLines');
             const accountsCollection = db.collection('accounts');

             // 1. Find the entry and its lines, verify ownership
              const entry = await journalEntriesCollection.findOne({ _id: entryId, tenantId: tenantId }, { session });
              if (!entry) throw new Error('Journal entry not found or access denied.');

              const oldLines = await journalEntryLinesCollection.find({ journalEntryId: entryId }, { session }).toArray();
              if (oldLines.length === 0) {
                  console.warn(`Journal entry ${entryId} has no lines to revert balances from.`);
                   // Decide if deletion should proceed or throw error
              }


             // 2. Revert Account Balance Changes
             const accountIds = oldLines.map(line => line.accountId);
             const accountsInfo = await accountsCollection.find(
                 { _id: { $in: accountIds } },
                 { projection: { _id: 1, type: 1 }, session }
             ).toArray();
             const accountTypeMap = new Map(accountsInfo.map(acc => [acc._id.toHexString(), acc.type]));

             for (const line of oldLines) {
                  const accountType = accountTypeMap.get(line.accountId.toHexString());
                  if (!accountType) throw new Error(`Account type for ${line.accountId} not found during balance reversal.`);

                  let change = 0;
                  // Reverse the logic from addJournalEntry
                  if (line.type === 'Debit') {
                      if (accountType === 'Asset' || accountType === 'Expense') change = -line.amount;
                      else change = line.amount;
                  } else { // Credit
                      if (accountType === 'Asset' || accountType === 'Expense') change = line.amount;
                      else change = -line.amount;
                  }

                  // Only update balance for Asset, Liability, Equity accounts
                  if (accountType === 'Asset' || accountType === 'Liability' || accountType === 'Equity') {
                      await accountsCollection.updateOne(
                          { _id: line.accountId },
                          { $inc: { balance: change } }, // Use $inc for atomic update
                          { session }
                      );
                      // Note: Consider error handling if account is suddenly missing during transaction
                  }
             }

             // 3. Delete the Journal Entry Lines
              await journalEntryLinesCollection.deleteMany({ journalEntryId: entryId }, { session });

             // 4. Delete the Journal Entry Header
             await journalEntriesCollection.deleteOne({ _id: entryId }, { session });

         }); // End Transaction

        await session.endSession();

        // Revalidate relevant paths
        revalidatePath('/journal-entries');
        revalidatePath('/chart-of-accounts');
        revalidatePath('/reports');
        revalidatePath('/dashboard');

        return { success: true, message: 'Journal entry deleted successfully.' };

    } catch (error: unknown) {
        await session.endSession(); // Ensure session closed on error
        console.error(`[DB_ERROR] ${context} Transaction:`, error);
        return {
            success: false,
            message: 'Database Transaction Error: Failed to delete journal entry.',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
