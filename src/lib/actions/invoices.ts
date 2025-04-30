

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Collection, ObjectId, WithId, MongoServerError } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { invoiceSchema, invoiceItemSchema, InvoiceSchema, invoiceFormSchema } from '@/lib/schemas/invoice';
import { clientSchema } from '@/lib/schemas/client';
import { getTenantId } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type InvoiceDocument = Omit<InvoiceSchema, 'id' | 'clientId' | 'items'> & {
    _id?: ObjectId;
    tenantId: string;
    clientId: ObjectId; // Store as ObjectId
    // items are handled via relation or subdocuments
    createdAt?: Date;
    updatedAt?: Date;
};
type InvoiceItemDocument = Omit<InvoiceItemSchema, 'id' | 'invoiceId' | 'taxRateId'> & {
     _id?: ObjectId;
     invoiceId: ObjectId;
     taxRateId?: ObjectId | null;
      // No tenantId needed if always accessed via Invoice
 };
type ClientLookupInfo = { _id: ObjectId; name: string; };
type TaxRateLookupInfo = { _id: ObjectId; name: string; ratePercent: number; };

// Helper to get collections
async function getInvoicesCollection(): Promise<Collection<InvoiceDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<InvoiceDocument>('invoices');
}
async function getInvoiceItemsCollection(): Promise<Collection<InvoiceItemDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<InvoiceItemDocument>('invoiceItems'); // Separate collection for items
}
export async function getClientsCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('clients');
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


// --- Invoice Number Generation (scoped per tenant) ---
async function getNextInvoiceNumber(tenantId: string): Promise<string> {
    const fallbackPrefix = `INV-${tenantId.substring(0, 4).toUpperCase()}-`;
    const fallbackNumber = `${fallbackPrefix}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const context = `getNextInvoiceNumber (Tenant: ${tenantId})`;
    try {
      const invoicesCollection = await getInvoicesCollection();
      // Find the latest invoice based on creation time or a sequential number if maintained
      const lastInvoice = await invoicesCollection.findOne(
          { tenantId: tenantId },
          { sort: { createdAt: -1 }, projection: { invoiceNumber: 1 } }
      );

      const prefix = `INV-`; // Standard prefix

      if (!lastInvoice || !lastInvoice.invoiceNumber) {
        return `${prefix}0001`;
      }

      const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
      let nextNum = 1;
      if (match && match[1]) {
        nextNum = parseInt(match[1], 10) + 1;
      } else {
          console.warn(`Unexpected invoice number format found for tenant ${tenantId}. Generating next based on count.`);
          const count = await invoicesCollection.countDocuments({ tenantId: tenantId });
          nextNum = count + 1;
      }
      return `${prefix}${String(nextNum).padStart(4, '0')}`;
  } catch (error) {
       console.error(`[HELPER_ERROR] Failed to get next invoice number for tenant ${tenantId}:`, error);
       console.warn(`[DB_WARN] Returning fallback invoice number for tenant ${tenantId} due to unexpected error.`);
      return fallbackNumber;
  }
}

// --- Get Invoices for the current tenant ---
export async function getInvoices(): Promise<InvoiceSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getInvoices.");
    return [];
  }
  const context = `getInvoices (Tenant: ${tenantId})`;

  try {
    const invoicesCollection = await getInvoicesCollection();
     // Use aggregation to join client data and potentially items (if not embedded)
    const invoicesCursor = invoicesCollection.aggregate([
        { $match: { tenantId: tenantId } },
        { $sort: { issueDate: -1 } },
        {
            $lookup: {
                from: 'clients',
                localField: 'clientId',
                foreignField: '_id',
                as: 'clientInfo'
            }
        },
         {
            $lookup: { // If items are in a separate collection
                from: 'invoiceItems',
                localField: '_id', // Invoice _id
                foreignField: 'invoiceId', // Link field in invoiceItems
                as: 'invoiceItemsData'
                 // Optionally add $lookup for taxRate within items here if needed
            }
        },
        {
            $project: { // Reshape output
                _id: 1, invoiceNumber: 1, issueDate: 1, dueDate: 1, status: 1, notes: 1, total: 1, createdAt: 1, updatedAt: 1, revenueAccountId: 1,
                clientId: 1, // Keep for mapping
                client: { $arrayElemAt: ['$clientInfo', 0] },
                items: '$invoiceItemsData' // Use the looked-up items
            }
        }
    ]);

    const invoicesArray = await invoicesCursor.toArray();

     // Map and parse data
     return invoicesArray.map(inv => {
        // Serialize dates before parsing
        const serializableInv = {
            ...inv,
            id: inv._id?.toHexString(),
            clientId: inv.clientId?.toHexString(), // Convert back to string
            revenueAccountId: inv.revenueAccountId?.toHexString() ?? undefined,
            total: inv.total, // Assuming stored as number
            issueDate: inv.issueDate?.toISOString(), // Convert Date to ISO string
            dueDate: inv.dueDate?.toISOString(), // Convert Date to ISO string
            createdAt: inv.createdAt?.toISOString(),
            updatedAt: inv.updatedAt?.toISOString(),
            notes: inv.notes ?? undefined,
            client: inv.client ? {
                ...inv.client, // Include all client fields fetched
                id: inv.client._id?.toHexString(),
                createdAt: inv.client.createdAt?.toISOString(), // Serialize nested dates too
                updatedAt: inv.client.updatedAt?.toISOString(),
            } : undefined,
            items: inv.items.map((item: any) => ({ // Serialize item dates
                ...item,
                id: item._id?.toHexString(),
                invoiceId: item.invoiceId?.toHexString(),
                taxRateId: item.taxRateId?.toHexString() ?? undefined,
                createdAt: item.createdAt?.toISOString(),
                updatedAt: item.updatedAt?.toISOString(),
            })),
        };
         return invoiceSchema.parse(serializableInv);
     });

  } catch (error) {
       console.error(`[ACTION_ERROR] ${context}:`, error);
       console.warn(`[DB_WARN] Returning empty invoices list for tenant ${tenantId} due to unexpected error.`);
       return [];
  }
}

// --- Get Invoice By ID (ensuring it belongs to the current tenant) ---
export async function getInvoiceById(idString: string): Promise<InvoiceSchema | null> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getInvoiceById.");
    return null;
  }
  const context = `getInvoiceById (ID: ${idString}, Tenant: ${tenantId})`;

  let invoiceId: ObjectId;
   try {
       invoiceId = new ObjectId(idString);
   } catch (e) {
       console.error(`[VALIDATION_ERROR] ${context}: Invalid Invoice ID format.`);
       return null;
   }

  try {
    const invoicesCollection = await getInvoicesCollection();
    // Use aggregation similar to getInvoices but match by _id
    const invoiceResult = await invoicesCollection.aggregate([
       { $match: { _id: invoiceId, tenantId: tenantId } },
       { $limit: 1 },
       {
            $lookup: { from: 'clients', localField: 'clientId', foreignField: '_id', as: 'clientInfo' }
       },
       {
            $lookup: { from: 'invoiceItems', localField: '_id', foreignField: 'invoiceId', as: 'invoiceItemsData' }
            // Add nested lookup for taxRate within items if needed
       },
       {
           $project: {
               _id: 1, invoiceNumber: 1, issueDate: 1, dueDate: 1, status: 1, notes: 1, total: 1, createdAt: 1, updatedAt: 1, revenueAccountId: 1,
               clientId: 1,
               client: { $arrayElemAt: ['$clientInfo', 0] }, // Fetch full client doc for parsing later
               items: '$invoiceItemsData'
           }
       }
    ]).toArray();

     if (invoiceResult.length === 0) {
         return null; // Not found or doesn't belong to tenant
     }
      const invoiceDoc = invoiceResult[0];

    // Serialize before parsing
     const serializableDoc = {
        ...invoiceDoc,
        id: invoiceDoc._id.toHexString(),
        clientId: invoiceDoc.clientId.toHexString(),
        revenueAccountId: invoiceDoc.revenueAccountId?.toHexString() ?? undefined,
        total: invoiceDoc.total,
        issueDate: invoiceDoc.issueDate?.toISOString(),
        dueDate: invoiceDoc.dueDate?.toISOString(),
        createdAt: invoiceDoc.createdAt?.toISOString(),
        updatedAt: invoiceDoc.updatedAt?.toISOString(),
        notes: invoiceDoc.notes ?? undefined,
        client: invoiceDoc.client ? {
             ...invoiceDoc.client,
             id: invoiceDoc.client._id.toHexString(),
             createdAt: invoiceDoc.client.createdAt?.toISOString(),
             updatedAt: invoiceDoc.client.updatedAt?.toISOString(),
        } : undefined,
        items: invoiceDoc.items.map((item: any) => ({
            ...item,
            id: item._id.toHexString(),
            invoiceId: item.invoiceId.toHexString(),
            taxRateId: item.taxRateId?.toHexString() ?? undefined,
            createdAt: item.createdAt?.toISOString(),
            updatedAt: item.updatedAt?.toISOString(),
        })),
     };

     // Parse and return, ensuring full client data is parsed
     return invoiceSchema.parse(serializableDoc);
  } catch (error: unknown) {
       console.error(`[ACTION_ERROR] ${context}:`, error);
       console.warn(`[DB_WARN] Returning null for invoice ${idString} (tenant ${tenantId}) due to unexpected error.`);
    return null;
  }
}

// --- Create Invoice for the current tenant ---
export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { success: false, message: 'Tenant ID not found. Cannot create invoice.' };
  }
  const context = `createInvoice (Tenant: ${tenantId})`;

   // --- 1. Validate Basic Fields & Client/Account Ownership ---
   const basicInvoiceData = { /* ... extract from formData ... */ };
   const basicValidation = invoiceFormSchema.omit({ items: true }).safeParse({ /* ... parse basicInvoiceData ... */ });

    if (!basicValidation.success) { /* handle basic validation error */ }

    let clientObjectId: ObjectId;
    let revenueAccountObjectId: ObjectId | undefined;
    try {
        clientObjectId = new ObjectId(basicValidation.data.clientId);
         if (basicValidation.data.revenueAccountId) {
             revenueAccountObjectId = new ObjectId(basicValidation.data.revenueAccountId);
         }

        // Validate client ownership
        const clientsCollection = await getClientsCollection();
        const client = await clientsCollection.findOne({ _id: clientObjectId, tenantId: tenantId }, { projection: { _id: 1 } });
        if (!client) return { success: false, message: "Invalid client selected.", fieldErrors: { clientId: ["Invalid client."] } };

        // Validate revenue account ownership and type if provided
        if (revenueAccountObjectId) {
             const accountsCollection = (await connectToDatabase()).db.collection('accounts');
             const account = await accountsCollection.findOne({ _id: revenueAccountObjectId, tenantId: tenantId }, { projection: { _id: 1, type: 1 } });
             if (!account || account.type !== 'Revenue') {
                 return { success: false, message: "Invalid revenue account selected.", fieldErrors: { revenueAccountId: ["Invalid revenue account."] } };
             }
        }
    } catch (error: any) {
        // Handle ObjectId errors and DB errors
        if (error instanceof Error && error.message.includes('Argument passed in must be a single String')) {
            if (!ObjectId.isValid(basicValidation.data.clientId)) return { success: false, message: 'Invalid Client ID format.', fieldErrors: { clientId: ['Invalid format.'] }};
             if (basicValidation.data.revenueAccountId && !ObjectId.isValid(basicValidation.data.revenueAccountId)) return { success: false, message: 'Invalid Revenue Account ID format.', fieldErrors: { revenueAccountId: ['Invalid format.'] }};
        }
        console.error(`[DB_ERROR] Error validating relations in ${context}:`, error);
        return { success: false, message: 'Database error during validation.' };
    }

    // --- 2. Parse and Validate Items ---
   const itemsJson = formData.get('items') as string;
   let parsedItems: any[];
   try { /* ... parse itemsJson ... */ } catch (error) { /* handle JSON parse error */ }

   const validatedItemsData: Omit<InvoiceItemDocument, '_id' | 'invoiceId'>[] = [];
   let calculatedTotal = 0;
   const itemErrors: string[] = [];
    const taxRateIdsToCheck: ObjectId[] = []; // Collect tax rate IDs

   for (let i = 0; i < parsedItems.length; i++) {
       const item = parsedItems[i];
       const itemValidation = invoiceItemSchema.pick({ description: true, quantity: true, unitPrice: true, taxRateId: true }).safeParse({ /* ... parse item ... */ });

       if (!itemValidation.success) { /* collect errors */ }
       else {
           const validItemData = itemValidation.data;
           let taxRateObjectId: ObjectId | undefined | null = undefined;
           if (validItemData.taxRateId) {
               try {
                   taxRateObjectId = new ObjectId(validItemData.taxRateId);
                   taxRateIdsToCheck.push(taxRateObjectId); // Add for bulk validation
               } catch {
                   itemErrors.push(`Item ${i+1}: Invalid Tax Rate ID format.`);
                   continue; // Skip this item if ID is invalid
               }
           }

           const itemSubtotal = validItemData.quantity * validItemData.unitPrice;
           // TODO: Fetch tax rate percentage based on validated taxRateObjectId later
           const itemTotal = itemSubtotal; // Update with tax calculation
           validatedItemsData.push({
               description: validItemData.description,
               quantity: validItemData.quantity,
               unitPrice: validItemData.unitPrice,
               taxRateId: taxRateObjectId, // Store ObjectId
               total: itemTotal,
           });
            calculatedTotal += itemTotal;
       }
   }

   if (itemErrors.length > 0) { /* handle item errors */ }

    // --- 3. Validate Tax Rate Ownership (Bulk Check) ---
    // try {
    //     if (taxRateIdsToCheck.length > 0) {
    //         const taxRatesCollection = await getTaxRatesCollection();
    //         const validTaxRatesCount = await taxRatesCollection.countDocuments({ _id: { $in: taxRateIdsToCheck }, tenantId: tenantId });
    //         if (validTaxRatesCount !== taxRateIdsToCheck.length) {
    //             return { success: false, message: "One or more selected tax rates are invalid for this tenant.", fieldErrors: { items: ["Invalid tax rate used."] } };
    //         }
    //         // Optional: Fetch rates here to calculate tax accurately if needed before insert
    //     }
    // } catch (error) { /* handle DB error */ }


  // --- 4. Create Invoice and Items in DB ---
  const { status, notes } = basicValidation.data; // issueDate, dueDate are already Date objects

  try {
     const invoiceNumber = await getNextInvoiceNumber(tenantId);
     const invoicesCollection = await getInvoicesCollection();
     const invoiceItemsCollection = await getInvoiceItemsCollection();

     // Insert Invoice Header
     const newInvoiceResult = await invoicesCollection.insertOne({
            tenantId: tenantId,
            invoiceNumber,
            clientId: clientObjectId,
            issueDate: basicValidation.data.issueDate,
            dueDate: basicValidation.data.dueDate,
            status,
            notes,
            total: calculatedTotal, // Use calculated total
            revenueAccountId: revenueAccountObjectId,
            createdAt: new Date(),
            updatedAt: new Date(),
     });

     if (!newInvoiceResult.insertedId) {
          throw new Error("Failed to insert invoice header.");
     }
     const newInvoiceId = newInvoiceResult.insertedId;

     // Insert Items linked to the new invoice ID
      if (validatedItemsData.length > 0) {
         const itemsToInsert = validatedItemsData.map(item => ({
             ...item,
             invoiceId: newInvoiceId, // Link to the created invoice
         }));
         const itemsResult = await invoiceItemsCollection.insertMany(itemsToInsert);
         if (!itemsResult.acknowledged || itemsResult.insertedCount !== validatedItemsData.length) {
             // Attempt to rollback or log inconsistency
             console.error(`Failed to insert all items for invoice ${newInvoiceId}. Rolling back may be needed.`);
             // Simple rollback attempt (might fail if invoice already deleted):
             await invoicesCollection.deleteOne({ _id: newInvoiceId });
             throw new Error("Failed to insert invoice items.");
         }
     }


    revalidatePath('/invoices');
    // revalidatePath(`/invoices/${newInvoiceId.toHexString()}`);
    revalidatePath('/dashboard');
    return { success: true, message: `Invoice ${invoiceNumber} created.`, data: { id: newInvoiceId.toHexString() } };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    // Handle potential duplicate invoiceNumber if constraint exists (unlikely with sequence)
     if (error instanceof MongoServerError && error.code === 11000 && error.message.includes('invoiceNumber_tenantId')) {
         return { success: false, message: 'Database Error: Invoice number conflict. Please try again.', error: 'Duplicate Key' };
     }
    return { success: false, message: 'Database Error: Failed to create invoice.', error: error instanceof Error ? error.message : String(error) };
  }
}

// --- Update Invoice ---
export async function updateInvoice(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const invoiceIdString = formData.get('id') as string;
   if (!invoiceIdString) return { success: false, message: "Invoice ID missing." };
   const context = `updateInvoice (ID: ${invoiceIdString}, Tenant: ${tenantId})`;

    let invoiceId: ObjectId;
    try {
        invoiceId = new ObjectId(invoiceIdString);
    } catch { return { success: false, message: 'Invalid Invoice ID format.' }; }

    // 1. Verify invoice belongs to the tenant
    try {
        const invoicesCollection = await getInvoicesCollection();
        const invoice = await invoicesCollection.findOne({ _id: invoiceId, tenantId: tenantId }, { projection: { _id: 1 } });
        if (!invoice) return { success: false, message: 'Invoice not found or access denied.', error: 'Not Found' };
    } catch (error) {
        console.error(`[DB_ERROR] Error verifying invoice ownership in ${context}:`, error);
        return { success: false, message: 'Database error verifying invoice ownership.' };
    }

   // 2. Perform validation (similar to createInvoice: basic fields, items, relations)
   // ... validation ...

   // 3. Transaction: Delete old items, insert new items, update header
   try {
        const invoicesCollection = await getInvoicesCollection();
        const invoiceItemsCollection = await getInvoiceItemsCollection();
        const { db, client: mongoClient } = await connectToDatabase(); // Get client for session
        const session = mongoClient.startSession();

        let updatedInvoiceData = null; // To store the result

        await session.withTransaction(async () => {
            // a. Delete existing items for this invoice
            await invoiceItemsCollection.deleteMany({ invoiceId: invoiceId }, { session });

            // b. Prepare and insert new items (reuse validation logic from createInvoice)
            const validatedItemsData: Omit<InvoiceItemDocument, '_id' | 'invoiceId'>[] = []; // Populate this
            let calculatedTotal = 0; // Recalculate this
            // ... (parsing and validation loop for items from formData) ...
             if (validatedItemsData.length > 0) {
                 const itemsToInsert = validatedItemsData.map(item => ({ ...item, invoiceId }));
                 await invoiceItemsCollection.insertMany(itemsToInsert, { session });
             }


            // c. Update the invoice header data
            const { clientId, issueDate, dueDate, status, notes, revenueAccountId } = { /* ... validated basic fields ... */ } as any; // Cast after validation
            let clientObjectId = new ObjectId(clientId);
            let revenueAccountObjectId = revenueAccountId ? new ObjectId(revenueAccountId) : undefined;
            // ... (re-validate client/account ownership if needed) ...

            const updateResult = await invoicesCollection.updateOne(
                { _id: invoiceId, tenantId: tenantId },
                {
                    $set: {
                         clientId: clientObjectId,
                         issueDate: issueDate,
                         dueDate: dueDate,
                         status,
                         notes,
                         total: calculatedTotal, // Use recalculated total
                         revenueAccountId: revenueAccountObjectId,
                         updatedAt: new Date()
                     }
                 },
                 { session }
             );
            if (updateResult.matchedCount === 0) {
                 throw new Error("Invoice not found during transaction update.");
            }
            // Optionally fetch updated invoice data within the transaction if needed immediately
        });

        await session.endSession();

        revalidatePath('/invoices');
        revalidatePath(`/invoices/${invoiceIdString}`);
        revalidatePath('/dashboard');
        // Fetch updated data outside transaction for response
        updatedInvoiceData = await getInvoiceById(invoiceIdString);
        return { success: true, message: 'Invoice updated successfully.', data: updatedInvoiceData };

   } catch(error) {
        console.error(`[DB_ERROR] ${context} Transaction:`, error);
        return { success: false, message: 'Database Transaction Error: Failed to update invoice.', error: error instanceof Error ? error.message : String(error) };
   }

  // console.warn("Update Invoice - Not fully implemented yet (Requires Complex Transaction Logic)");
  // return { success: false, message: 'Update Invoice - Not Implemented Yet' };
}

// --- Delete Invoice ---
export async function deleteInvoice(idString: string): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { success: false, message: 'Tenant ID not found.' };
  }
  if (!idString) return { success: false, message: 'Invoice ID is required.' };
  const context = `deleteInvoice (ID: ${idString}, Tenant: ${tenantId})`;

    let invoiceId: ObjectId;
    try {
        invoiceId = new ObjectId(idString);
    } catch { return { success: false, message: 'Invalid Invoice ID format.' }; }

  try {
     const invoicesCollection = await getInvoicesCollection();
     const invoiceItemsCollection = await getInvoiceItemsCollection();
     const paymentsCollection = (await connectToDatabase()).db.collection('payments'); // Assuming payments collection

     // Check if invoice exists and belongs to the tenant
     const invoice = await invoicesCollection.findOne({ _id: invoiceId, tenantId: tenantId }, { projection: { _id: 1 } });
     if (!invoice) return { success: false, message: 'Invoice not found or access denied.', error: 'Not Found' };


     // TODO: Add business logic checks (e.g., cannot delete if payments exist?)
     // const paymentsCount = await paymentsCollection.countDocuments({ invoiceId: invoiceId, tenantId });
     // if (paymentsCount > 0) return { success: false, message: "Cannot delete invoice with recorded payments."};

     // Delete related items first (or use a transaction)
     const itemDeleteResult = await invoiceItemsCollection.deleteMany({ invoiceId: invoiceId });
     console.log(`Deleted ${itemDeleteResult.deletedCount} items for invoice ${idString}`);

     // Delete the invoice header
     const invoiceDeleteResult = await invoicesCollection.deleteOne({ _id: invoiceId, tenantId: tenantId });

     if (invoiceDeleteResult.deletedCount === 0) {
         // This shouldn't happen if the initial find worked, but handle defensively
         console.warn(`Invoice ${idString} found initially but failed to delete.`);
         return { success: false, message: 'Failed to delete invoice header after deleting items.', error: 'Inconsistency' };
     }

    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { success: true, message: 'Invoice deleted successfully.' };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    return { success: false, message: 'Database Error: Failed to delete invoice.', error: error instanceof Error ? error.message : String(error) };
  }
}
