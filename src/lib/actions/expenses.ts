
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { expenseSchema, expenseFormSchema, ExpenseSchema } from '@/lib/schemas/expense';
import { getTenantId } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type ExpenseDocument = Omit<ExpenseSchema, 'id' | 'accountId' | 'vendorId' | 'taxRateId'> & {
    _id?: ObjectId;
    tenantId: string;
    accountId: ObjectId; // Store as ObjectId
    vendorId?: ObjectId | null; // Store as ObjectId if present
    taxRateId?: ObjectId | null; // Store as ObjectId if present
    createdAt?: Date;
    updatedAt?: Date;
};
// Simplified types for lookup results
type AccountLookupInfo = { _id: ObjectId; name: string; code: string; type: string; };
type VendorLookupInfo = { _id: ObjectId; name: string; };

// Helper to get collections
async function getExpensesCollection(): Promise<Collection<ExpenseDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<ExpenseDocument>('expenses');
}
async function getAccountsCollection(): Promise<Collection<any>> { // Use 'any' for simplicity or define AccountDocument
  const { db } = await connectToDatabase();
  return db.collection('accounts');
}
async function getVendorsCollection(): Promise<Collection<any>> { // Use 'any' for simplicity or define VendorDocument
  const { db } = await connectToDatabase();
  return db.collection('vendors');
}
// Add getTaxRatesCollection if needed

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get Expenses for the current tenant ---
export async function getExpenses(): Promise<ExpenseSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getExpenses.");
      return [];
  }
  const context = `getExpenses (Tenant: ${tenantId})`;

  try {
    const expensesCollection = await getExpensesCollection();
    // Use aggregation pipeline to join related data
    const expensesCursor = expensesCollection.aggregate([
        { $match: { tenantId: tenantId } },
        { $sort: { date: -1 } },
        {
            $lookup: {
                from: 'accounts',
                localField: 'accountId',
                foreignField: '_id',
                as: 'accountInfo'
            }
        },
        {
            $lookup: {
                from: 'vendors',
                localField: 'vendorId',
                foreignField: '_id',
                as: 'vendorInfo'
            }
        },
        // Add lookup for taxRates if needed
        {
            $project: { // Reshape the output
                _id: 1, date: 1, amount: 1, description: 1, receiptUrl: 1, status: 1,
                isRecurring: 1, recurrenceRule: 1, createdAt: 1, updatedAt: 1,
                accountId: 1, // Keep ObjectId for mapping later if needed, or map here
                vendorId: 1,
                taxRateId: 1,
                account: { $arrayElemAt: ['$accountInfo', 0] }, // Get the first element from the lookup array
                vendor: { $arrayElemAt: ['$vendorInfo', 0] }
                // taxRate: { $arrayElemAt: ['$taxRateInfo', 0] }
            }
        }
    ]);

    const expensesArray = await expensesCursor.toArray();

    // Map MongoDB document to schema
     return expensesArray.map(doc => expenseSchema.parse({
         ...doc,
         id: doc._id?.toHexString(),
         accountId: doc.accountId?.toHexString(), // Convert back to string for schema
         vendorId: doc.vendorId?.toHexString() ?? undefined,
         taxRateId: doc.taxRateId?.toHexString() ?? undefined,
         date: new Date(doc.date),
         amount: doc.amount, // Assuming stored as number
         description: doc.description ?? undefined,
         receiptUrl: doc.receiptUrl ?? undefined,
         recurrenceRule: doc.recurrenceRule ?? undefined,
         // Map nested objects, handle potential nulls from lookup
         account: doc.account ? {
             id: doc.account._id?.toHexString(),
             name: doc.account.name,
             code: doc.account.code,
             type: doc.account.type,
             // Add other required fields from accountSchema if needed
         } : undefined, // Or provide a default/error object
         vendor: doc.vendor ? {
             id: doc.vendor._id?.toHexString(),
             name: doc.vendor.name,
              // Add other required fields from vendorSchema if needed
         } : undefined,
         // taxRate: doc.taxRate ? { ... } : undefined,
     }));
  } catch (error: unknown) {
     console.error(`[ACTION_ERROR] ${context}:`, error);
     console.warn(`[DB_WARN] Returning empty expenses list for tenant ${tenantId} due to unexpected error.`);
    return [];
  }
}

// --- Get Expense by ID (ensuring it belongs to the current tenant) ---
export async function getExpenseById(idString: string): Promise<ExpenseSchema | null> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       console.error("[ACTION_ERROR] Tenant ID not found in getExpenseById.");
       return null;
   }
   const context = `getExpenseById (ID: ${idString}, Tenant: ${tenantId})`;

    let expenseId: ObjectId;
    try {
        expenseId = new ObjectId(idString);
    } catch (e) {
        console.error(`[VALIDATION_ERROR] ${context}: Invalid Expense ID format.`);
        return null;
    }

  try {
    const expensesCollection = await getExpensesCollection();
    // Use aggregation to get related data in one go
     const expenseResult = await expensesCollection.aggregate([
        { $match: { _id: expenseId, tenantId: tenantId } }, // Match ID and tenant
        { $limit: 1 }, // Should only be one
        {
            $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'accountInfo' }
        },
        {
            $lookup: { from: 'vendors', localField: 'vendorId', foreignField: '_id', as: 'vendorInfo' }
        },
        // Add taxRate lookup if needed
        {
            $project: {
                // Project fields similar to getExpenses
                 _id: 1, date: 1, amount: 1, description: 1, receiptUrl: 1, status: 1,
                isRecurring: 1, recurrenceRule: 1, createdAt: 1, updatedAt: 1,
                accountId: 1, vendorId: 1, taxRateId: 1,
                account: { $arrayElemAt: ['$accountInfo', 0] },
                vendor: { $arrayElemAt: ['$vendorInfo', 0] }
            }
        }
    ]).toArray();


    if (expenseResult.length === 0) {
        return null; // Not found or doesn't belong to the tenant
    }
    const expenseDoc = expenseResult[0];

     return expenseSchema.parse({
         // Map fields similar to getExpenses
          ...expenseDoc,
         id: expenseDoc._id?.toHexString(),
         accountId: expenseDoc.accountId?.toHexString(),
         vendorId: expenseDoc.vendorId?.toHexString() ?? undefined,
         taxRateId: expenseDoc.taxRateId?.toHexString() ?? undefined,
         date: new Date(expenseDoc.date),
         amount: expenseDoc.amount,
         description: expenseDoc.description ?? undefined,
         receiptUrl: expenseDoc.receiptUrl ?? undefined,
         recurrenceRule: expenseDoc.recurrenceRule ?? undefined,
         account: expenseDoc.account ? {
             id: expenseDoc.account._id?.toHexString(),
             name: expenseDoc.account.name,
             code: expenseDoc.account.code,
             type: expenseDoc.account.type,
         } : undefined,
         vendor: expenseDoc.vendor ? {
             id: expenseDoc.vendor._id?.toHexString(),
             name: expenseDoc.vendor.name,
         } : undefined,
     });
  } catch (error: unknown) {
      console.error(`[ACTION_ERROR] ${context}:`, error);
      console.warn(`[DB_WARN] Returning null for expense ${idString} (tenant ${tenantId}) due to unexpected error.`);
    return null;
  }
}


// --- Add New Expense for the current tenant ---
export async function addExpense(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add expense.' };
   }
   const context = `addExpense (Tenant: ${tenantId})`;

  // --- 1. Parse and Validate Form Data ---
  const rawData = {
    date: formData.get('date'),
    accountId: formData.get('accountId'),
    amount: formData.get('amount'),
    description: formData.get('description'),
    status: formData.get('status') || 'Pending',
    vendorId: formData.get('vendorId'),
    isRecurring: formData.get('isRecurring') === 'true',
    recurrenceRule: formData.get('recurrenceRule'),
    taxRateId: formData.get('taxRateId'),
    // receiptFile: formData.get('receiptFile') // Handle file separately if implementing upload
  };

  const validatedFields = expenseFormSchema.safeParse({
     date: rawData.date ? new Date(rawData.date as string) : undefined,
     accountId: rawData.accountId,
     amount: rawData.amount ? parseFloat(rawData.amount as string) : undefined,
     description: rawData.description || undefined,
     status: rawData.status,
     vendorId: rawData.vendorId || undefined,
     isRecurring: rawData.isRecurring,
     recurrenceRule: rawData.recurrenceRule || undefined,
     taxRateId: rawData.taxRateId || undefined,
  });

  if (!validatedFields.success) {
     const fieldErrors = validatedFields.error.flatten().fieldErrors;
     console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

   // --- 2. Validate ObjectIDs and Tenant Ownership of Relations ---
   let accountObjectId: ObjectId;
   let vendorObjectId: ObjectId | undefined | null = undefined;
   let taxRateObjectId: ObjectId | undefined | null = undefined;

   try {
       accountObjectId = new ObjectId(validatedFields.data.accountId);
       if (validatedFields.data.vendorId) vendorObjectId = new ObjectId(validatedFields.data.vendorId);
       if (validatedFields.data.taxRateId) taxRateObjectId = new ObjectId(validatedFields.data.taxRateId);

       const accountsCollection = await getAccountsCollection();
       const vendorsCollection = await getVendorsCollection();
       // const taxRatesCollection = await getTaxRatesCollection(); // If needed

       // Check account
       const account = await accountsCollection.findOne({ _id: accountObjectId, tenantId: tenantId }, { projection: { _id: 1, type: 1 } });
       if (!account || account.type !== 'Expense') { // Ensure it's an Expense account
           return { success: false, message: 'Invalid expense account selected.', fieldErrors: { accountId: ['Invalid expense account.'] } };
       }

       // Check vendor if provided
       if (vendorObjectId) {
           const vendor = await vendorsCollection.findOne({ _id: vendorObjectId, tenantId: tenantId }, { projection: { _id: 1 } });
           if (!vendor) {
                return { success: false, message: 'Invalid vendor selected.', fieldErrors: { vendorId: ['Invalid vendor.'] } };
           }
       }
       // Check tax rate if provided
       // if (taxRateObjectId) { ... }

   } catch (error: any) {
       if (error instanceof Error && error.message.includes('Argument passed in must be a single String')) {
            // Likely invalid ObjectId format passed from form
             if (!ObjectId.isValid(validatedFields.data.accountId)) return { success: false, message: 'Invalid Account ID format.', fieldErrors: { accountId: ['Invalid format.'] }};
             if (validatedFields.data.vendorId && !ObjectId.isValid(validatedFields.data.vendorId)) return { success: false, message: 'Invalid Vendor ID format.', fieldErrors: { vendorId: ['Invalid format.'] }};
             if (validatedFields.data.taxRateId && !ObjectId.isValid(validatedFields.data.taxRateId)) return { success: false, message: 'Invalid Tax Rate ID format.', fieldErrors: { taxRateId: ['Invalid format.'] }};
       }
       console.error(`[DB_ERROR] Error validating relations in ${context}:`, error);
       return { success: false, message: 'Database error during validation.' };
   }


  // --- 3. Handle File Upload (Placeholder) ---
  // TODO: Implement file upload logic here (e.g., to Firebase Storage)
  const receiptUrl = undefined; // Replace with actual URL after upload

  // --- 4. Insert into Database ---
  try {
    const expensesCollection = await getExpensesCollection();
    const newExpenseDocument: Omit<ExpenseDocument, '_id'> = {
        ...validatedFields.data,
        tenantId: tenantId,
        accountId: accountObjectId, // Use validated ObjectId
        vendorId: vendorObjectId,
        taxRateId: taxRateObjectId,
        receiptUrl: receiptUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const result = await expensesCollection.insertOne(newExpenseDocument);
     if (!result.insertedId) {
        throw new Error("Failed to insert new expense document.");
    }

    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense added successfully.', data: { ...newExpenseDocument, id: result.insertedId.toHexString() } };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    return { success: false, message: 'Database Error: Failed to add expense.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Expense for the current tenant ---
const updateExpenseFormSchema = expenseFormSchema.extend({
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid expense ID." }),
});

export async function updateExpense(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const expenseIdString = formData.get('id') as string;
   if (!expenseIdString) return { success: false, message: 'Expense ID is missing.' };
   const context = `updateExpense (ID: ${expenseIdString}, Tenant: ${tenantId})`;

    let expenseId: ObjectId;
    try {
        expenseId = new ObjectId(expenseIdString);
    } catch (e) {
        return { success: false, message: 'Invalid Expense ID format.' };
    }

   // --- 1. Validate Form Data and Relations (similar to addExpense) ---
   const rawData = { /* ... extract from formData ... */ id: expenseIdString };
   const validatedFields = updateExpenseFormSchema.safeParse(rawData);

    if (!validatedFields.success) { /* handle error */ }

   // --- 2. Verify Ownership and Relations ---
   let accountObjectId: ObjectId;
   let vendorObjectId: ObjectId | undefined | null = undefined;
   // ... declare other ObjectIds ...
   try {
        const expensesCollection = await getExpensesCollection();
        // Check expense exists and belongs to tenant
        const expense = await expensesCollection.findOne({ _id: expenseId, tenantId: tenantId }, { projection: { _id: 1 }});
        if (!expense) return { success: false, message: 'Expense not found or access denied.', error: 'Not Found' };

        // Validate account/vendor/taxRate ObjectIds and ownership
        accountObjectId = new ObjectId(validatedFields.data.accountId);
        // ... validate vendorObjectId, taxRateObjectId ...
        // ... check ownership of account, vendor, taxRate ...

   } catch (error: any) { /* handle ObjectId errors and DB errors */ }


   // --- 3. Handle File Update (Placeholder) ---
   // TODO: Handle potential receipt file update/replacement here.

   // --- 4. Update Database ---
   const { id, ...updateData } = validatedFields.data; // Exclude string id

   try {
        const expensesCollection = await getExpensesCollection();
        const result = await expensesCollection.updateOne(
            { _id: expenseId, tenantId: tenantId }, // Ensure tenant match
            {
                $set: {
                    ...updateData,
                    accountId: accountObjectId, // Store ObjectIds
                    vendorId: vendorObjectId,
                    taxRateId: taxRateObjectId,
                    // receiptUrl: updatedReceiptUrl // Add logic for updated URL
                    updatedAt: new Date()
                 }
            }
        );

        if (result.matchedCount === 0) {
            return { success: false, message: 'Expense not found or access denied during update.', error: 'Not Found' };
        }
         if (result.modifiedCount === 0) {
             return { success: true, message: 'Expense details unchanged.' };
         }

        revalidatePath('/expenses');
        revalidatePath(`/expenses/${expenseIdString}`);
        revalidatePath('/dashboard');
        // Fetch updated data to return if needed
        const updatedExpense = await getExpenseById(expenseIdString); // Reuse existing function
        return { success: true, message: 'Expense updated successfully.', data: updatedExpense };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    return { success: false, message: 'Database Error: Failed to update expense.', error: error instanceof Error ? error.message : String(error) };
  }
}


// --- Delete Expense for the current tenant ---
export async function deleteExpense(idString: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!idString) return { success: false, message: 'Expense ID is required.' };
   const context = `deleteExpense (ID: ${idString}, Tenant: ${tenantId})`;

    let expenseId: ObjectId;
    try {
        expenseId = new ObjectId(idString);
    } catch (e) {
        return { success: false, message: 'Invalid Expense ID format.' };
    }

  try {
     const expensesCollection = await getExpensesCollection();
     // Verify expense belongs to the tenant and get receipt URL if needed
     const expense = await expensesCollection.findOne({ _id: expenseId, tenantId: tenantId }, { projection: { receiptUrl: 1 }});
     if (!expense) {
         return { success: false, message: 'Expense not found or access denied.', error: 'Not Found' };
     }

     // Optional: Delete associated receipt file from storage first
     // if (expense.receiptUrl) {
     //    await deleteFileFromFirebaseStorage(expense.receiptUrl);
     // }

    const result = await expensesCollection.deleteOne({ _id: expenseId, tenantId: tenantId }); // Ensure tenant match

    if (result.deletedCount === 0) {
        return { success: false, message: 'Expense not found or access denied during deletion.', error: 'Not Found' };
    }

    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: true, message: 'Expense deleted successfully.' };
  } catch (error: unknown) {
     console.error(`[DB_ERROR] ${context}:`, error);
     return { success: false, message: 'Database Error: Failed to delete expense.', error: error instanceof Error ? error.message : String(error) };
  }
}


// --- Get Expense Categories (Accounts of type 'Expense' for the current tenant) ---
export async function getExpenseCategories(): Promise<{ value: string; label: string }[]> {
    const tenantId = await getTenantId();
    if (!tenantId) {
      console.error("[ACTION_ERROR] Tenant ID not found in getExpenseCategories.");
      return [];
    }
    const context = `getExpenseCategories (Tenant: ${tenantId})`;
   try {
     const accountsCollection = await getAccountsCollection();
     const expenseAccountsCursor = accountsCollection.find({
           tenantId: tenantId,
           type: 'Expense',
           isActive: true
        }, {
            projection: { _id: 1, name: 1, code: 1 },
            sort: { name: 1 }
        });
      const expenseAccountsArray = await expenseAccountsCursor.toArray();

     // Format label to include code for clarity
     return expenseAccountsArray.map(acc => ({ value: acc._id.toHexString(), label: `${acc.code} - ${acc.name}` }));
   } catch (error) {
        console.error(`[ACTION_ERROR] ${context}:`, error);
        console.warn(`[DB_WARN] Returning empty expense categories list for tenant ${tenantId} due to unexpected error.`);
     return [];
   }
 }
