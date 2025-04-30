
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { accountSchema, AccountSchema, accountFormSchema } from '@/lib/schemas/account'; // Assuming schema definitions remain similar
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID (implement this)

// Type definition for MongoDB documents matching AccountSchema
// Note: MongoDB uses _id, not id
type AccountDocument = Omit<AccountSchema, 'id'> & { _id?: ObjectId; tenantId: string; createdAt?: Date; updatedAt?: Date };

// Helper to get the accounts collection
async function getAccountsCollection(): Promise<Collection<AccountDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<AccountDocument>('accounts');
}

// Type definition for the result of actions
type ActionResult = {
    success: boolean;
    message: string;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get All Accounts for the current tenant ---
export async function getAccounts(): Promise<AccountSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getAccounts.");
      return [];
  }
  const context = `getAccounts (Tenant: ${tenantId})`;

  try {
    const accountsCollection = await getAccountsCollection();
    const accountsCursor = accountsCollection.find({ tenantId: tenantId }).sort({ code: 1 });
    const accountsArray = await accountsCursor.toArray();

    // Map MongoDB document to schema, converting _id to id
    return accountsArray.map(doc => accountSchema.parse({
        ...doc,
        id: doc._id?.toHexString(), // Convert ObjectId to string id
        balance: doc.balance ?? 0, // Ensure balance has a default
        // Ensure optional fields are handled if necessary
        description: doc.description ?? undefined,
    }));
  } catch (error: unknown) {
     console.error(`[ACTION_ERROR] ${context}:`, error);
     console.warn(`[DB_WARN] Returning empty accounts list for tenant ${tenantId} due to unexpected error.`);
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

  const validatedFields = accountFormSchema.safeParse({
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || undefined,
    isActive: rawData.isActive ? rawData.isActive === 'true' : true,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  const { code, name, type, description, isActive } = validatedFields.data;

  try {
    const accountsCollection = await getAccountsCollection();

    // Check if account code already exists for this tenant
    const existingAccount = await accountsCollection.findOne({ tenantId, code });
    if (existingAccount) {
        return {
            success: false, message: `Database Error: Account code "${code}" already exists for this tenant.`, error: 'Duplicate Key',
            fieldErrors: { code: [`Account code "${code}" already exists for this tenant.`] }
        };
    }

    const newAccountDocument: Omit<AccountDocument, '_id'> = {
        tenantId: tenantId,
        code,
        name,
        type,
        description,
        isActive,
        balance: 0, // Initial balance
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const result = await accountsCollection.insertOne(newAccountDocument);

    if (!result.insertedId) {
         throw new Error("Failed to insert new account document.");
    }

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: `Account "${name}" (Code: ${code}) created successfully.` };

  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    // More specific MongoDB error handling could be added here if needed
    return { success: false, message: 'Database Error: Failed to create account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Account for the current tenant ---
const updateAccountFormSchema = accountFormSchema.extend({
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid account ID." }), // Check if valid ObjectId string
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot update account.' };
   }
   const accountIdString = formData.get('id') as string;
   const context = `updateAccount (ID: ${accountIdString}, Tenant: ${tenantId})`;

   let accountId: ObjectId;
   try {
        accountId = new ObjectId(accountIdString);
   } catch (e) {
        return { success: false, message: 'Invalid Account ID format.' };
   }


  const rawData = Object.fromEntries(formData.entries());

   const validatedFields = updateAccountFormSchema.safeParse({
    id: accountIdString, // Validate the string format first
    code: rawData.code,
    name: rawData.name,
    type: rawData.type,
    description: rawData.description || undefined,
    isActive: rawData.isActive ? rawData.isActive === 'true' : true,
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  const { id, ...updateData } = validatedFields.data; // Exclude the string ID

  try {
     const accountsCollection = await getAccountsCollection();

     // Verify the account exists and belongs to the current tenant
     const account = await accountsCollection.findOne({ _id: accountId, tenantId: tenantId });

     if (!account) {
         return { success: false, message: 'Database Error: Account not found or access denied.', error: 'Not Found' };
     }

     // Check for duplicate code if code is being changed
      if (updateData.code !== account.code) {
          const existingCode = await accountsCollection.findOne({ _id: { $ne: accountId }, tenantId, code: updateData.code });
          if (existingCode) {
              return {
                  success: false, message: `Database Error: Account code "${updateData.code}" is already in use by this tenant.`, error: 'Duplicate Key',
                  fieldErrors: { code: [`Account code "${updateData.code}" is already in use by this tenant.`] }
              };
          }
      }


     const result = await accountsCollection.updateOne(
         { _id: accountId, tenantId: tenantId }, // Ensure tenant match in update query
         { $set: { ...updateData, updatedAt: new Date() } }
     );

     if (result.matchedCount === 0) {
         return { success: false, message: 'Database Error: Account not found during update or tenant mismatch.', error: 'Not Found' };
     }
     if (result.modifiedCount === 0) {
         // Can happen if data submitted is identical to existing data
         return { success: true, message: `Account "${updateData.name}" details unchanged.` };
     }

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: `Account "${updateData.name}" (Code: ${updateData.code}) updated successfully.` };
  } catch (error: unknown) {
     console.error(`[DB_ERROR] ${context}:`, error);
     return { success: false, message: 'Database Error: Failed to update account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Delete Account for the current tenant ---
export async function deleteAccount(idString: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot delete account.' };
   }
   const context = `deleteAccount (ID: ${idString}, Tenant: ${tenantId})`;

    let accountId: ObjectId;
    try {
        accountId = new ObjectId(idString);
    } catch (e) {
        console.error(`[VALIDATION_ERROR] ${context}: Invalid Account ID format.`);
        return { success: false, message: 'Invalid Account ID provided.' };
    }


  try {
    const accountsCollection = await getAccountsCollection();
    // TODO: Add collections for expenses and journal entries
    // const expensesCollection = (await connectToDatabase()).db.collection('expenses');
    // const journalLinesCollection = (await connectToDatabase()).db.collection('journalEntryLines');

     // Check if the account exists and belongs to the tenant
     const account = await accountsCollection.findOne({ _id: accountId, tenantId: tenantId });
     if (!account) {
        return { success: false, message: 'Account not found or access denied.', error: 'Not Found' };
     }

    // IMPORTANT: Check for related data before deleting
    // Example: Check if linked in Expenses or Journal Entries
    // const relatedExpense = await expensesCollection.findOne({ accountId: idString, tenantId });
    // const relatedJournalLine = await journalLinesCollection.findOne({ accountId: idString, tenantId }); // Assuming tenantId is also on lines for easier query

    // if (relatedExpense || relatedJournalLine) {
    //     return { success: false, message: 'Cannot delete account: It is linked to existing Expenses or Journal Entries.', error: 'Constraint Violation' };
    // }

    // Add check for non-zero balance if required by business logic
    // if (account.balance !== 0) {
    //     return { success: false, message: 'Cannot delete account with a non-zero balance.' };
    // }

    const result = await accountsCollection.deleteOne({ _id: accountId, tenantId: tenantId });

    if (result.deletedCount === 0) {
        return { success: false, message: 'Account not found or access denied during deletion.', error: 'Not Found' };
    }

    revalidatePath('/chart-of-accounts');
    revalidatePath('/reports');
    return { success: true, message: 'Account deleted successfully.' };

  } catch (error: unknown) {
     console.error(`[DB_ERROR] ${context}:`, error);
     return { success: false, message: 'Database Error: Failed to delete account.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Get Account by ID (ensuring it belongs to the current tenant) ---
export async function getAccountById(idString: string): Promise<AccountSchema | null> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       console.error("[ACTION_ERROR] Tenant ID not found in getAccountById.");
       return null;
   }
   const context = `getAccountById (ID: ${idString}, Tenant: ${tenantId})`;

    let accountId: ObjectId;
    try {
        accountId = new ObjectId(idString);
    } catch (e) {
        console.error(`[VALIDATION_ERROR] ${context}: Invalid Account ID format.`);
        return null;
    }

  try {
    const accountsCollection = await getAccountsCollection();
    const accountDoc = await accountsCollection.findOne({ _id: accountId, tenantId: tenantId });

    if (!accountDoc) {
        return null; // Return null if not found or doesn't belong to tenant
    }

    // Parse the fetched data using the main schema
    return accountSchema.parse({
        ...accountDoc,
        id: accountDoc._id.toHexString(), // Map _id to id
        balance: accountDoc.balance ?? 0,
        description: accountDoc.description ?? undefined,
    });
  } catch (error: unknown) {
       console.error(`[ACTION_ERROR] ${context}:`, error);
       console.warn(`[DB_WARN] Returning null for account ${idString} (tenant ${tenantId}) due to unexpected error.`);
    return null; // Return null on any error
  }
}
