
'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { companySettingSchema, companySettingFormSchema, CompanySettingSchema } from '@/lib/schemas/companySetting';
import { getTenantId, isSuperAdmin } from '@/lib/utils/tenant';

// Type definition for MongoDB documents
type CompanySettingDocument = Omit<CompanySettingSchema, 'id'> & { _id?: ObjectId; tenantId: string; createdAt?: Date; updatedAt?: Date };

// Helper to get the collection
async function getCompanySettingsCollection(): Promise<Collection<CompanySettingDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<CompanySettingDocument>('companySettings');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: CompanySettingSchema | null;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get Company Settings for the current tenant ---
export async function getCompanySettings(): Promise<CompanySettingSchema | null> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getCompanySettings.");
    return null;
  }

  const context = `getCompanySettings (Tenant: ${tenantId})`;
  try {
    const settingsCollection = await getCompanySettingsCollection();
    const settingsDoc = await settingsCollection.findOne({ tenantId: tenantId });

    if (!settingsDoc) {
       // Optionally: Create default settings if they don't exist?
        console.log(`No company settings found for tenant ${tenantId}. Returning null.`);
       return null;
    }

    // Validate and map fetched data
    return companySettingSchema.parse({
        ...settingsDoc,
        id: settingsDoc._id?.toHexString(),
        companyName: settingsDoc.companyName ?? undefined,
        logoUrl: settingsDoc.logoUrl ?? undefined,
        address: settingsDoc.address ?? undefined,
    });
  } catch (error) {
    console.error(`[ACTION_ERROR] ${context}:`, error);
    console.warn(`[DB_WARN] Returning null for company settings for tenant ${tenantId} due to unexpected error.`);
    return null;
  }
}

// --- Update Company Settings for the current tenant ---
export async function updateCompanySettings(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { success: false, message: 'Tenant ID not found. Cannot update settings.' };
  }
  const context = `updateCompanySettings (Tenant: ${tenantId})`;

  // Authorization check (ensure user is Admin/Owner for this tenant)
  // Example: const userRole = await getUserRole(); if (userRole !== 'Admin') return { ... };

  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = companySettingFormSchema.safeParse({
    companyName: rawData.companyName || undefined,
    logoUrl: rawData.logoUrl || undefined,
    address: rawData.address || undefined,
    // Parse other fields...
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const settingsCollection = await getCompanySettingsCollection();

    const updateData = { ...validatedFields.data, updatedAt: new Date() };

    // Use upsert: update if exists, insert if not
    const result = await settingsCollection.updateOne(
        { tenantId: tenantId }, // Filter
        {
            $set: updateData,
            $setOnInsert: { tenantId: tenantId, createdAt: new Date() } // Set these only on insert
        },
        { upsert: true } // Enable upsert
    );

    if (!result.acknowledged) {
        throw new Error("Database operation not acknowledged.");
    }
    if (result.upsertedId) {
        console.log(`Created new company settings for tenant ${tenantId}`);
    } else if (result.matchedCount === 0) {
        // Should not happen with upsert unless there's a race condition or other issue
        console.warn(`Company settings update matched 0 documents for tenant ${tenantId}, but upsert was true.`);
    }

    // Fetch the updated/created document to return it
     const updatedDoc = await settingsCollection.findOne({ tenantId: tenantId });
     const returnData = updatedDoc ? companySettingSchema.parse({
         ...updatedDoc,
         id: updatedDoc._id.toHexString(),
         // ensure optional fields are handled
     }) : null;


    revalidatePath('/settings'); // Revalidate settings page
    return { success: true, message: 'Company settings updated successfully.', data: returnData };
  } catch (error: unknown) {
    console.error(`[DB_ERROR] ${context}:`, error);
    return {
        success: false,
        message: 'Database Error: Failed to update settings.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}
