
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { budgetSchema, budgetFormSchema, BudgetSchema } from '@/lib/schemas/budget';
import { getTenantId } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type BudgetDocument = Omit<BudgetSchema, 'id' | 'accountId'> & {
    _id?: ObjectId;
    tenantId: string;
    accountId: ObjectId; // Store as ObjectId
    createdAt?: Date;
    updatedAt?: Date;
};
type AccountDocument = { _id?: ObjectId; name: string; code: string; tenantId: string };

// Helper to get collections
async function getBudgetsCollection(): Promise<Collection<BudgetDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<BudgetDocument>('budgets');
}
async function getAccountsCollection(): Promise<Collection<AccountDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<AccountDocument>('accounts');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// --- Get Budgets for the current tenant ---
export async function getBudgets(filters?: { year?: number }): Promise<BudgetSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getBudgets.");
      return [];
  }
  const context = `getBudgets (Tenant: ${tenantId})`;

  try {
    const budgetsCollection = await getBudgetsCollection();
    const query: any = { tenantId: tenantId };
    if (filters?.year) {
      query.period = { $regex: `^${filters.year}` }; // Match periods starting with the year
    }

    // Use aggregation to join with accounts
    const budgetsWithAccounts = await budgetsCollection.aggregate([
        { $match: query },
        {
            $lookup: {
                from: 'accounts', // The name of the accounts collection
                localField: 'accountId',
                foreignField: '_id',
                as: 'accountInfo'
            }
        },
        {
           $unwind: { // Deconstruct the accountInfo array (should only be one match)
               path: '$accountInfo',
               preserveNullAndEmptyArrays: true // Keep budget even if account is somehow missing
           }
        },
         {
            $sort: { // Sort after lookup if possible
                 period: 1,
                 'accountInfo.code': 1
            }
        }
    ]).toArray();


    // Map MongoDB document to schema
     return budgetsWithAccounts.map(doc => budgetSchema.parse({
        ...doc,
        id: doc._id?.toHexString(),
        accountId: doc.accountId?.toHexString(), // Convert ObjectId back to string for schema
        amount: doc.amount, // Assuming amount is stored as number
        // Map the joined account data
        account: doc.accountInfo ? {
             id: doc.accountInfo._id?.toHexString(),
             name: doc.accountInfo.name,
             code: doc.accountInfo.code,
             // Add other fields required by accountSchema.optional() if needed
        } : undefined,
     }));
  } catch (error) {
    console.error(`[ACTION_ERROR] ${context}:`, error);
    console.warn(`[DB_WARN] Returning empty budgets list for tenant ${tenantId} due to unexpected error.`);
    return [];
  }
}

// --- Add Budget for the current tenant ---
export async function addBudget(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add budget.' };
   }
   const context = `addBudget (Tenant: ${tenantId})`;

  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = budgetFormSchema.safeParse({
    accountId: rawData.accountId,
    period: rawData.period,
    amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

   let accountObjectId: ObjectId;
   try {
       accountObjectId = new ObjectId(validatedFields.data.accountId);
   } catch (e) {
        return { success: false, message: 'Invalid Account ID format.', fieldErrors: { accountId: ['Invalid ID format'] } };
   }

   // Validate that the selected account belongs to the tenant
   try {
       const accountsCollection = await getAccountsCollection();
       const account = await accountsCollection.findOne({ _id: accountObjectId, tenantId: tenantId }, { projection: { _id: 1 } });
       if (!account) {
           return { success: false, message: 'Invalid account selected.', fieldErrors: { accountId: ['Invalid account selected.'] } };
       }
   } catch (error) {
       console.error(`[DB_ERROR] Error validating account for tenant ${tenantId} during budget creation:`, error);
       return { success: false, message: 'Database error during validation.' };
   }


  try {
    const budgetsCollection = await getBudgetsCollection();

    // Check for existing budget for this account/period/tenant
    const existingBudget = await budgetsCollection.findOne({
        tenantId,
        accountId: accountObjectId,
        period: validatedFields.data.period
    });
    if (existingBudget) {
         return {
             success: false,
             message: 'Database Error: A budget for this account and period already exists for this tenant.',
             error: 'Duplicate Key',
             fieldErrors: { period: ['Budget already exists for this account/period.'], accountId: ['Budget already exists for this account/period.']}
          };
    }


    const newBudgetDocument: Omit<BudgetDocument, '_id'> = {
        tenantId: tenantId,
        accountId: accountObjectId, // Store as ObjectId
        period: validatedFields.data.period,
        amount: validatedFields.data.amount,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const result = await budgetsCollection.insertOne(newBudgetDocument);
    if (!result.insertedId) {
        throw new Error("Failed to insert new budget document.");
    }

    revalidatePath('/budgets');
    revalidatePath('/reports');
    return { success: true, message: `Budget for period ${newBudgetDocument.period} added successfully.`, data: { ...newBudgetDocument, id: result.insertedId.toHexString() } };
  } catch (error: unknown) {
     console.error(`[DB_ERROR] ${context}:`, error);
    return {
        success: false,
        message: 'Database Error: Failed to add budget.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Budget for the current tenant ---
export async function updateBudget(formData: FormData): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    const budgetIdString = formData.get('id') as string;
    if (!budgetIdString) return { success: false, message: "Budget ID missing." };
    const context = `updateBudget (ID: ${budgetIdString}, Tenant: ${tenantId})`;

    let budgetId: ObjectId;
    try {
        budgetId = new ObjectId(budgetIdString);
    } catch (e) {
        return { success: false, message: 'Invalid Budget ID format.' };
    }

    // 1. Validate form data (e.g., amount) - period/account changes might be disallowed or complex
     const rawData = Object.fromEntries(formData.entries());
     // Assuming only amount can be updated for simplicity here
     const validatedFields = z.object({
          amount: z.coerce.number().nonnegative({ message: "Budget amount cannot be negative." })
      }).safeParse({
          amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined
      });

     if (!validatedFields.success) {
         const fieldErrors = validatedFields.error.flatten().fieldErrors;
         console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
         return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
     }

    // 2. Perform update
    try {
        const budgetsCollection = await getBudgetsCollection();
        const result = await budgetsCollection.updateOne(
            { _id: budgetId, tenantId: tenantId }, // Ensure tenant match
            { $set: { amount: validatedFields.data.amount, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return { success: false, message: 'Budget not found or access denied.', error: 'Not Found' };
        }
         if (result.modifiedCount === 0) {
             return { success: true, message: 'Budget details unchanged.' };
         }

        revalidatePath('/budgets');
        revalidatePath('/reports');
        return { success: true, message: 'Budget updated successfully.' };
    } catch (error) {
         console.error(`[DB_ERROR] ${context}:`, error);
        return { success: false, message: 'Database Error: Failed to update budget.' };
    }
}

// --- Delete Budget for the current tenant ---
export async function deleteBudget(idString: string): Promise<ActionResult> {
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
    if (!idString) return { success: false, message: "Budget ID missing." };
    const context = `deleteBudget (ID: ${idString}, Tenant: ${tenantId})`;

    let budgetId: ObjectId;
    try {
        budgetId = new ObjectId(idString);
    } catch (e) {
        return { success: false, message: 'Invalid Budget ID format.' };
    }

    try {
        const budgetsCollection = await getBudgetsCollection();
        const result = await budgetsCollection.deleteOne({ _id: budgetId, tenantId: tenantId }); // Ensure tenant match

        if (result.deletedCount === 0) {
            return { success: false, message: 'Budget not found or access denied.', error: 'Not Found' };
        }

        revalidatePath('/budgets');
        revalidatePath('/reports');
        return { success: true, message: 'Budget deleted successfully.' };
    } catch (error) {
        console.error(`[DB_ERROR] ${context}:`, error);
        return { success: false, message: 'Database Error: Failed to delete budget.' };
    }
}
