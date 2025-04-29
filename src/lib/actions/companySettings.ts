
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { companySettingSchema, companySettingFormSchema, CompanySettingSchema } from '@/lib/schemas/companySetting';
import { getTenantId, isSuperAdmin } from '@/lib/utils/tenant'; // Helper to get tenant ID and check admin status

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: CompanySettingSchema | null;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Flag to prevent spamming the console with the same libssl error
let libsslErrorLogged = false;

// Helper function to check and log Prisma init errors
// Returns true if it WAS an initialization error, false otherwise
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Log the more detailed environment message only once
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 or 3 (check Prisma version compatibility) is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging
         }
         return true; // Indicate that it was an initialization error
     }
     return false; // Not an initialization error
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
        console.warn(`[DB_WARN] Database connection failed while fetching company settings for tenant ${tenantId}. Returning null.`);
    } else {
        console.error(`[ACTION_ERROR] Error fetching company settings for tenant ${tenantId}:`, error);
         console.warn(`[DB_WARN] Returning null for company settings for tenant ${tenantId} due to unexpected error.`);
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
  const context = `updateCompanySettings (Tenant: ${tenantId})`;

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
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

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
    console.error(`[DB_ERROR] ${context}:`, error);
    return {
        success: false,
        message: 'Database Error: Failed to update settings.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}
