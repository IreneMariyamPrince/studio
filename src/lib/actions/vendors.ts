
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { vendorSchema, vendorFormSchema, VendorSchema } from '@/lib/schemas/vendor';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
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

// --- Get Vendors for the current tenant ---
export async function getVendors(): Promise<VendorSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getVendors.");
    return [];
  }
  const context = `getVendors (Tenant: ${tenantId})`;

  try {
    const vendors = await prisma.vendor.findMany({
        where: { tenantId: tenantId }, // Filter by tenant
        orderBy: { name: 'asc' }
    });
    // Validate each vendor against the schema before returning
     return vendors.map(vendor => vendorSchema.parse({
        ...vendor,
        email: vendor.email ?? undefined,
        phone: vendor.phone ?? undefined,
        address: vendor.address ?? undefined,
        paymentTerms: vendor.paymentTerms ?? undefined,
        balanceOwed: vendor.balanceOwed?.toNumber() ?? 0, // Handle Decimal
    }));
  } catch (error) {
     if (checkPrismaInitError(error, context)) {
          console.warn(`[DB_WARN] Database connection failed while fetching vendors for tenant ${tenantId}. Returning empty list.`);
     } else {
        console.error(`[ACTION_ERROR] Error fetching vendors for tenant ${tenantId}:`, error);
        console.warn(`[DB_WARN] Returning empty vendors list for tenant ${tenantId} due to unexpected error.`);
     }
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

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const newVendor = await prisma.vendor.create({
      data: {
          ...validatedFields.data,
          tenantId: tenantId, // Associate with current tenant
        },
    });

    revalidatePath('/vendors'); // Revalidate the vendor list page
    revalidatePath('/expenses/new'); // Revalidate new expense page if vendor dropdown is there
    return { success: true, message: `Vendor "${newVendor.name}" added successfully.`, data: newVendor };
  } catch (error: unknown) {
    if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error. Failed to add vendor.', error: 'Initialization Error' };
    }
     console.error(`[DB_ERROR] ${context}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       // Check unique constraint for email within the tenant
       if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('email') && (error.meta?.target as string[])?.includes('tenantId')) {
         return {
             success: false,
             message: 'Database Error: A vendor with this email already exists for this tenant.',
             error: error.code,
             fieldErrors: { email: ['This email is already registered for this tenant.'] }
          };
       }
     }
    return {
        success: false,
        message: 'Database Error: Failed to add vendor.',
        error: error instanceof Error ? error.message : String(error)
    };
  }
}

// --- Update Vendor for the current tenant ---
export async function updateVendor(formData: FormData): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   const vendorId = formData.get('id') as string;
   if (!vendorId) return { success: false, message: "Vendor ID missing." };
   const context = `updateVendor (ID: ${vendorId}, Tenant: ${tenantId})`;

   // 1. Verify vendor belongs to the tenant
    try {
        const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { tenantId: true } });
        if (!vendor) return { success: false, message: 'Vendor not found.' };
        if (vendor.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
        if (checkPrismaInitError(error, `${context} - Ownership Check`)) {
             return { success: false, message: 'Database Connection Error during ownership check.' };
        }
        console.error(`[DB_ERROR] Error verifying vendor ownership in ${context}:`, error);
        return { success: false, message: 'Database error verifying vendor ownership.' };
    }

    // 2. Validate form data
    // ... validation logic ...

    // 3. Perform update
    try {
         const updatedVendor = await prisma.vendor.update({
             where: { id: vendorId },
             data: { /* validated data */ },
         });
         revalidatePath('/vendors');
         revalidatePath(`/vendors/${vendorId}`); // If vendor detail pages exist
         return { success: true, message: 'Vendor updated successfully.' };
    } catch (error) {
        if (checkPrismaInitError(error, context)) {
             return { success: false, message: 'Database Connection Error. Failed to update vendor.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] ${context}:`, error);
        // Handle DB errors (connection, unique constraint)
        return { success: false, message: 'Database Error: Failed to update vendor.' /* + specific error handling */ };
    }
}

// --- Delete Vendor for the current tenant ---
export async function deleteVendor(id: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!id) return { success: false, message: "Vendor ID missing." };
   const context = `deleteVendor (ID: ${id}, Tenant: ${tenantId})`;

   try {
        // 1. Verify vendor belongs to the tenant
        const vendor = await prisma.vendor.findUnique({ where: { id }, select: { tenantId: true } });
        if (!vendor) return { success: false, message: 'Vendor not found.', error: 'P2025' };
        if (vendor.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };

        // 2. Perform delete (Expenses link is SetNull, so this should work)
        await prisma.vendor.delete({ where: { id } });

        revalidatePath('/vendors');
        revalidatePath('/expenses'); // Revalidate expenses as vendor info might disappear
        return { success: true, message: 'Vendor deleted successfully.' };
   } catch (error) {
        if (checkPrismaInitError(error, context)) {
           return { success: false, message: 'Database Connection Error. Failed to delete vendor.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] ${context}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             return { success: false, message: 'Vendor not found.', error: error.code };
         }
        return { success: false, message: 'Database Error: Failed to delete vendor.' };
   }
}
