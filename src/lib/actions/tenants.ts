

'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId, MongoServerError } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { tenantSchema, tenantFormSchema, TenantSchema } from '@/lib/schemas/tenant';
import { isSuperAdmin } from '@/lib/utils/tenant'; // Keep using this for authorization
import { z } from 'zod'; // Ensure z is imported

// Type definition for MongoDB documents
type TenantDocument = Omit<TenantSchema, 'id'> & { _id?: ObjectId; createdAt?: Date; updatedAt?: Date };
type CompanySettingDocument = { _id?: ObjectId; tenantId: ObjectId; companyName: string; createdAt?: Date; updatedAt?: Date };


// Helper to get collections
async function getTenantsCollection(): Promise<Collection<TenantDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<TenantDocument>('tenants');
}
async function getCompanySettingsCollection(): Promise<Collection<CompanySettingDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<CompanySettingDocument>('companySettings');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: TenantSchema | TenantSchema[] | null;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Super Admin: Get All Tenants ---
export async function getAllTenants(): Promise<ActionResult> {
  if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }
  const context = 'getAllTenants';

  try {
    const tenantsCollection = await getTenantsCollection();
    const tenantsCursor = tenantsCollection.find({}).sort({ name: 1 });
    const tenantsArray = await tenantsCursor.toArray();

    const parsedTenants = tenantsArray.map(t => {
        // Serialize dates before parsing
        const serializableTenant = {
            ...t,
            id: t._id?.toHexString(),
            createdAt: t.createdAt?.toISOString(),
            updatedAt: t.updatedAt?.toISOString(),
        };
        return tenantSchema.parse(serializableTenant);
    });
    return { success: true, message: 'Tenants fetched successfully.', data: parsedTenants };
  } catch (error) {
    console.error(`[ACTION_ERROR] ${context}:`, error);
    return { success: false, message: 'Failed to fetch tenants.', error };
  }
}

// --- Super Admin: Create Tenant ---
export async function createTenant(formData: FormData): Promise<ActionResult> {
  if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }
  const context = 'createTenant';

  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = tenantFormSchema.safeParse({
    name: rawData.name,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    return { success: false, message: 'Validation failed.', error: 'Validation Error', fieldErrors };
  }

  const { db, client: mongoClient } = await connectToDatabase();
  const session = mongoClient.startSession();

  try {
     let createdTenantData: TenantSchema | null = null;

     await session.withTransaction(async () => {
        const tenantsCollection = db.collection<TenantDocument>('tenants');
        const companySettingsCollection = db.collection<CompanySettingDocument>('companySettings');

        // Check if tenant name already exists
         const existingTenant = await tenantsCollection.findOne({ name: validatedFields.data.name }, { session });
         if (existingTenant) {
             throw new Error('Duplicate Key'); // Throw specific error to handle below
         }

        const tenantInsertResult = await tenantsCollection.insertOne(
            { ...validatedFields.data, createdAt: new Date(), updatedAt: new Date() },
            { session }
        );
         if (!tenantInsertResult.insertedId) throw new Error("Failed to insert tenant.");
         const newTenantId = tenantInsertResult.insertedId;

        // Create default CompanySetting entry
        await companySettingsCollection.insertOne(
            {
                tenantId: newTenantId,
                companyName: validatedFields.data.name, // Default company name
                createdAt: new Date(),
                updatedAt: new Date()
            },
            { session }
        );
        // Store data to return outside transaction
        createdTenantData = tenantSchema.parse({
             ...validatedFields.data,
              id: newTenantId.toHexString(),
              createdAt: new Date().toISOString(), // Provide current date as string
              updatedAt: new Date().toISOString()
        });
     }); // End Transaction

    await session.endSession();

    revalidatePath('/superadmin/tenants'); // Or wherever tenants are listed
    return { success: true, message: `Tenant "${createdTenantData?.name}" created successfully.`, data: createdTenantData };

  } catch (error) {
     await session.endSession(); // Ensure session closes on error
     console.error(`[DB_ERROR] ${context}:`, error);
     if (error instanceof Error && error.message === 'Duplicate Key') {
       return { success: false, message: 'A tenant with this name already exists.', error: 'Duplicate Key', fieldErrors: { name: ['Name already taken.'] } };
     }
     if (error instanceof MongoServerError && error.code === 11000) {
         return { success: false, message: 'A tenant with this name already exists.', error: 'Duplicate Key', fieldErrors: { name: ['Name already taken.'] } };
     }
     return { success: false, message: 'Failed to create tenant.', error };
  }
}

// --- Super Admin: Update Tenant ---
const updateTenantFormSchema = tenantFormSchema.extend({
  id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid tenant ID." }),
});
export async function updateTenant(formData: FormData): Promise<ActionResult> {
   if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }

  const tenantIdString = formData.get('id') as string;
  if (!tenantIdString) return { success: false, message: 'Tenant ID missing.' };
  const context = `updateTenant (ID: ${tenantIdString})`;

   let tenantId: ObjectId;
   try { tenantId = new ObjectId(tenantIdString); }
   catch { return { success: false, message: 'Invalid Tenant ID format.' }; }


  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = updateTenantFormSchema.safeParse({ id: tenantIdString, name: rawData.name });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    return { success: false, message: 'Validation failed.', error: 'Validation Error', fieldErrors };
  }

  const { id, ...updateData } = validatedFields.data; // Exclude id string

  try {
    const tenantsCollection = await getTenantsCollection();

    // Check for name conflict before updating
     const existingName = await tenantsCollection.findOne({ _id: { $ne: tenantId }, name: updateData.name });
     if (existingName) {
          return { success: false, message: 'Another tenant with this name already exists.', error: 'Duplicate Key', fieldErrors: { name: ['Name already taken.'] } };
     }

    const result = await tenantsCollection.updateOne(
        { _id: tenantId },
        { $set: { ...updateData, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
         return { success: false, message: 'Tenant not found.', error: 'Not Found' };
     }
     if (result.modifiedCount === 0) {
         return { success: true, message: 'Tenant name unchanged.' };
     }


    revalidatePath('/superadmin/tenants');
    // Fetch updated tenant data to return
    const updatedTenantDoc = await tenantsCollection.findOne({ _id: tenantId });
    const returnData = updatedTenantDoc ? tenantSchema.parse({
         ...updatedTenantDoc,
         id: updatedTenantDoc._id.toHexString(),
         createdAt: updatedTenantDoc.createdAt?.toISOString(),
         updatedAt: updatedTenantDoc.updatedAt?.toISOString(),
         }) : null;
    return { success: true, message: 'Tenant updated successfully.', data: returnData };
  } catch (error) {
    console.error(`[DB_ERROR] ${context}:`, error);
    // Handle potential duplicate key errors during update (race condition, though check helps)
    if (error instanceof MongoServerError && error.code === 11000) {
         return { success: false, message: 'Another tenant with this name already exists.', error: 'Duplicate Key', fieldErrors: { name: ['Name already taken.'] } };
    }
    return { success: false, message: 'Failed to update tenant.', error };
  }
}

// --- Super Admin: Delete Tenant ---
export async function deleteTenant(idString: string): Promise<ActionResult> {
   if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }
  if (!idString) return { success: false, message: 'Tenant ID missing.' };
  const context = `deleteTenant (ID: ${idString})`;

    let tenantId: ObjectId;
    try { tenantId = new ObjectId(idString); }
    catch { return { success: false, message: 'Invalid Tenant ID format.' }; }

    // IMPORTANT: Deleting a tenant requires deleting ALL associated data
    // (users, accounts, invoices, expenses, settings, etc.) across multiple collections.
    // This MUST be done within a transaction for atomicity.
    const { db, client: mongoClient } = await connectToDatabase();
    const session = mongoClient.startSession();

  try {
      await session.withTransaction(async () => {
         const tenantsCollection = db.collection<TenantDocument>('tenants');

         // 1. Verify tenant exists
         const tenant = await tenantsCollection.findOne({ _id: tenantId }, { session });
         if (!tenant) throw new Error('Tenant not found.'); // Error will abort transaction

         // 2. Delete data from ALL related collections (use tenantId as the filter)
          console.log(`Deleting data for tenant ${tenantId}...`);
          await db.collection('users').deleteMany({ tenantId: idString }, { session }); // Assuming tenantId on user is string
          await db.collection('accounts').deleteMany({ tenantId: idString }, { session }); // Assuming tenantId on account is string
          await db.collection('invoices').deleteMany({ tenantId: idString }, { session });
          // Find invoice IDs first to delete items
          const invoiceIdsToDelete = await db.collection('invoices').find({ tenantId: idString }, { projection: { _id: 1 }, session }).map(inv => inv._id).toArray();
          if (invoiceIdsToDelete.length > 0) {
              await db.collection('invoiceItems').deleteMany({ invoiceId: { $in: invoiceIdsToDelete } }, { session });
          }
          await db.collection('expenses').deleteMany({ tenantId: idString }, { session });
          await db.collection('payments').deleteMany({ tenantId: idString }, { session });
          await db.collection('clients').deleteMany({ tenantId: idString }, { session });
          await db.collection('vendors').deleteMany({ tenantId: idString }, { session });
          await db.collection('budgets').deleteMany({ tenantId: idString }, { session });
          await db.collection('companySettings').deleteMany({ tenantId: tenantId }, { session }); // Assuming tenantId is ObjectId here
          // ... delete from any other tenant-specific collections ...
          console.log(`Finished deleting associated data for tenant ${tenantId}.`);


         // 3. Delete the tenant document itself
         const deleteResult = await tenantsCollection.deleteOne({ _id: tenantId }, { session });
         if (deleteResult.deletedCount === 0) {
             // Should not happen if findOne succeeded, but good practice
             throw new Error("Tenant found but failed to delete.");
         }
         console.log(`Deleted tenant document ${tenantId}.`);
      }); // End Transaction

      await session.endSession();

      revalidatePath('/superadmin/tenants');
      return { success: true, message: 'Tenant and all associated data deleted successfully.' };
  } catch (error) {
     await session.endSession(); // Ensure session closes on error
     console.error(`[DB_ERROR] ${context} Transaction:`, error);
     if (error instanceof Error && error.message === 'Tenant not found.') {
          return { success: false, message: 'Tenant not found.', error: 'Not Found' };
     }
    return { success: false, message: 'Failed to delete tenant and associated data.', error };
  }
}
