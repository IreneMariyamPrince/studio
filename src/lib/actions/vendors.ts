
'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { vendorSchema, vendorFormSchema, VendorSchema } from '@/lib/schemas/vendor';
import { getTenantId } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type VendorDocument = Omit<VendorSchema, 'id'> & { _id?: ObjectId; tenantId: string; createdAt?: Date; updatedAt?: Date };

// Helper to get the vendors collection
async function getVendorsCollection(): Promise<Collection<VendorDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<VendorDocument>('vendors');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get Vendors for the current tenant ---
export async function getVendors(): Promise<VendorSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getVendors.");
    return [];
  }
  const context = `getVendors (Tenant: ${tenantId})`;

  try {
    const vendorsCollection = await getVendorsCollection();
    const vendorsCursor = vendorsCollection.find({ tenantId: tenantId }).sort({ name: 1 });
    const vendorsArray = await vendorsCursor.toArray();

    // Map MongoDB document to schema
     return vendorsArray.map(doc => vendorSchema.parse({
        ...doc,
        id: doc._id?.toHexString(),
        email: doc.email ?? undefined,
        phone: doc.phone ?? undefined,
        address: doc.address ?? undefined,
        paymentTerms: doc.paymentTerms ?? undefined,
        balanceOwed: doc.balanceOwed ?? 0,
    }));
  } catch (error) {
     console.error(`[ACTION_ERROR] ${context}:`, error);
     console.warn(`[DB_WARN] Returning empty vendors list for tenant ${tenantId} due to unexpected error.`);
    return [];
  }
}

// --- Add Vendor for the current tenant ---
export async function addVendor(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) {
       return { success: false, message: 'Tenant ID not found. Cannot add vendor.' };
   }
   const context = `addVendor (Tenant: ${tenantId})`;

  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = vendorFormSchema.safeParse({
    name: rawData.name,
    email: rawData.email || undefined,
    phone: rawData.phone || undefined,
    address: rawData.address || undefined,
    paymentTerms: rawData.paymentTerms || undefined,
  });

  if (!validatedFields.success) { /* handle error */ }

  try {
    const vendorsCollection = await getVendorsCollection();

    // Optional: Check if email already exists for this tenant
    if (validatedFields.data.email) {
        const existingVendor = await vendorsCollection.findOne({ tenantId, email: validatedFields.data.email });
        if (existingVendor) {
            return {
                success: false, message: 'Database Error: A vendor with this email already exists for this tenant.', error: 'Duplicate Key',
                fieldErrors: { email: ['This email is already registered.'] }
            };
        }
    }

    const newVendorDocument: Omit<VendorDocument, '_id'> = {
        ...validatedFields.data,
        tenantId: tenantId,
        balanceOwed: 0, // Initial balance
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const result = await vendorsCollection.insertOne(newVendorDocument);
     if (!result.insertedId) throw new Error("Failed to insert vendor.");

    revalidatePath('/vendors');
    revalidatePath('/expenses/new');
    return { success: true, message: `Vendor "${newVendorDocument.name}" added successfully.`, data: { ...newVendorDocument, id: result.insertedId.toHexString() } };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    // Handle potential duplicate key errors on email if index exists
    if ((error as any).code === 11000 && (error as any).message.includes('email')) {
        return { success: false, message: 'Database Error: Email already exists.', error: 'Duplicate Key', fieldErrors: { email: ['Email already registered.'] } };
    }
    return {
        success: false, message: 'Database Error: Failed to add vendor.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Vendor for the current tenant ---
const updateVendorFormSchema = vendorFormSchema.extend({
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid vendor ID." }),
});
export async function updateVendor(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const vendorIdString = formData.get('id') as string;
   if (!vendorIdString) return { success: false, message: "Vendor ID missing." };
   const context = `updateVendor (ID: ${vendorIdString}, Tenant: ${tenantId})`;

    let vendorId: ObjectId;
    try { vendorId = new ObjectId(vendorIdString); }
    catch { return { success: false, message: 'Invalid Vendor ID format.' }; }

   const rawData = Object.fromEntries(formData.entries());
   const validatedFields = updateVendorFormSchema.safeParse({ id: vendorIdString, /* ...parse other fields... */ });

   if (!validatedFields.success) { /* handle error */ }

   const { id, ...updateData } = validatedFields.data;

    try {
        const vendorsCollection = await getVendorsCollection();

        // Verify vendor exists and belongs to tenant
        const vendor = await vendorsCollection.findOne({ _id: vendorId, tenantId: tenantId });
        if (!vendor) return { success: false, message: 'Vendor not found or access denied.', error: 'Not Found' };

         // Optional: Check for duplicate email if email is being changed
        if (updateData.email && updateData.email !== vendor.email) {
             const existingEmail = await vendorsCollection.findOne({ _id: { $ne: vendorId }, tenantId, email: updateData.email });
             if (existingEmail) {
                  return { success: false, message: `Email already in use.`, error: 'Duplicate Key', fieldErrors: { email: [`Email already in use.`] } };
             }
        }

        const result = await vendorsCollection.updateOne(
            { _id: vendorId, tenantId: tenantId },
            { $set: { ...updateData, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) return { success: false, message: 'Vendor not found during update.', error: 'Not Found' };
        if (result.modifiedCount === 0) return { success: true, message: 'Vendor details unchanged.' };

         revalidatePath('/vendors');
         // revalidatePath(`/vendors/${vendorIdString}`);
         return { success: true, message: 'Vendor updated successfully.' };
    } catch (error) {
        console.error(`[DB_ERROR] ${context}:`, error);
        // Handle potential duplicate key errors on email
        if ((error as any).code === 11000 && (error as any).message.includes('email')) {
            return { success: false, message: 'Email already in use.', error: 'Duplicate Key', fieldErrors: { email: ['Email already in use.'] } };
        }
        return { success: false, message: 'Database Error: Failed to update vendor.' };
    }
}

// --- Delete Vendor for the current tenant ---
export async function deleteVendor(idString: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!idString) return { success: false, message: "Vendor ID missing." };
   const context = `deleteVendor (ID: ${idString}, Tenant: ${tenantId})`;

    let vendorId: ObjectId;
    try { vendorId = new ObjectId(idString); }
    catch { return { success: false, message: 'Invalid Vendor ID format.' }; }

   try {
        const vendorsCollection = await getVendorsCollection();
        const expensesCollection = (await connectToDatabase()).db.collection('expenses');

        // 1. Verify vendor exists and belongs to tenant
        const vendor = await vendorsCollection.findOne({ _id: vendorId, tenantId: tenantId }, { projection: { _id: 1 } });
        if (!vendor) return { success: false, message: 'Vendor not found or access denied.', error: 'Not Found' };

        // 2. Check for related Expenses (important!)
         const relatedExpense = await expensesCollection.findOne({ vendorId: vendorId, tenantId: tenantId }, { projection: { _id: 1 } });
         if (relatedExpense) {
             // Option 1: Prevent deletion
             return { success: false, message: 'Cannot delete vendor: Vendor is linked to existing expenses.', error: 'Constraint Violation' };
             // Option 2: Set vendorId to null on related expenses (requires schema change/different update)
             // await expensesCollection.updateMany({ vendorId: vendorId, tenantId }, { $set: { vendorId: null } });
         }

        // 3. Perform delete
        const result = await vendorsCollection.deleteOne({ _id: vendorId, tenantId: tenantId });

         if (result.deletedCount === 0) return { success: false, message: 'Vendor not found during deletion.', error: 'Not Found' };

        revalidatePath('/vendors');
        revalidatePath('/expenses'); // Revalidate expenses as vendor info might change (if nullified)
        return { success: true, message: 'Vendor deleted successfully.' };
   } catch (error) {
       console.error(`[DB_ERROR] ${context}:`, error);
       return { success: false, message: 'Database Error: Failed to delete vendor.' };
   }
}
