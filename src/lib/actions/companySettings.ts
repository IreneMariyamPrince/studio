
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { companySettingSchema, companySettingFormSchema, CompanySettingSchema } from '@/lib/schemas/companySetting';
import { Prisma } from '@prisma/client';
import { getTenantId, isSuperAdmin } from '@/lib/utils/tenant'; // Helper to get tenant ID and check admin status

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: CompanySettingSchema | null;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Helper function to check and log Prisma init errors (assume it exists)
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         return true;
     }
     return false;
}

// --- Get Company Settings for the current tenant ---
export async function getCompanySettings(): Promise<CompanySettingSchema | null> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getCompanySettings.");
    return null; // Return null if no tenant context
  }

  const context = `getCompanySettings (Tenant: ${tenantId})`;
  try {
    const settings = await prisma.companySetting.findUnique({
      where: { tenantId: tenantId },
    });

    if (!settings) {
      // Optional: Create default settings if they don't exist?
      // Or just return null.
      return null;
    }

    // Validate fetched data
    return companySettingSchema.parse({
        ...settings,
        // Ensure optional fields are handled correctly if needed
        companyName: settings.companyName ?? undefined,
        logoUrl: settings.logoUrl ?? undefined,
        address: settings.address ?? undefined,
    });
  } catch (error) {
    if (checkPrismaInitError(error, context)) {
        console.warn(`Returning null for company settings for tenant ${tenantId} due to DB connection issue.`);
    } else {
        console.error(`[ACTION_ERROR] Error fetching company settings for tenant ${tenantId}:`, error);
    }
    return null; // Return null on any error
  }
}

// --- Update Company Settings for the current tenant ---
export async function updateCompanySettings(formData: FormData): Promise<ActionResult> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { success: false, message: 'Tenant ID not found. Cannot update settings.' };
  }

  // Authorization check (optional, middleware might handle this)
  // const isAdmin = await isTenantAdmin(); // Implement a function to check if user is admin of tenantId
  // if (!isAdmin) return { success: false, message: 'Unauthorized.' };

  const rawData = Object.fromEntries(formData.entries());

  const validatedFields = companySettingFormSchema.safeParse({
    companyName: rawData.companyName || undefined,
    logoUrl: rawData.logoUrl || undefined, // Add validation if file upload is handled separately
    address: rawData.address || undefined,
    // Parse other fields...
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error(`[VALIDATION_ERROR] updateCompanySettings (Tenant: ${tenantId}):`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  const context = `updateCompanySettings (Tenant: ${tenantId})`;
  try {
    // Use upsert to create settings if they don't exist, or update if they do
    const updatedSettings = await prisma.companySetting.upsert({
      where: { tenantId: tenantId },
      update: validatedFields.data,
      create: {
        tenantId: tenantId,
        ...validatedFields.data,
      },
    });

    revalidatePath('/settings'); // Revalidate settings page
    return { success: true, message: 'Company settings updated successfully.', data: companySettingSchema.parse(updatedSettings) };
  } catch (error: unknown) {
    if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error. Failed to update settings.', error: 'Initialization Error' };
    }
    console.error(`[DB_ERROR] Failed to update company settings for tenant ${tenantId}:`, error);
    return {
        success: false,
        message: 'Database Error: Failed to update settings.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}
