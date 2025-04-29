
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { vendorSchema, vendorFormSchema, VendorSchema } from '@/lib/schemas/vendor';
import { Prisma } from '@prisma/client';
import { getTenantId } from '@/lib/utils/tenant'; // Helper to get tenant ID

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Helper function to check and log Prisma init errors (assume it exists)
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         // Handle libssl error message specifically if needed
         return true;
     }
     return false;
}

// --- Get Vendors for the current tenant ---
export async function getVendors(): Promise<VendorSchema[]> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.error("[ACTION_ERROR] Tenant ID not found in getVendors.");
    return [];
  }

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
     if (checkPrismaInitError(error, `getVendors (Tenant: ${tenantId})`)) {
          console.warn(`Returning empty vendors list for tenant ${tenantId} due to DB connection issue.`);
     } else {
        console.error(`[ACTION_ERROR] Error fetching vendors for tenant ${tenantId}:`, error);
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
    console.error(`[VALIDATION_ERROR] addVendor (Tenant: ${tenantId}):`, fieldErrors);
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
    if (checkPrismaInitError(error, `addVendor (Tenant: ${tenantId})`)) {
        return { success: false, message: 'Database Connection Error. Failed to add vendor.', error: 'Initialization Error' };
    }
     console.error(`[DB_ERROR] Failed to add vendor for tenant ${tenantId}:`, error);
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

   // 1. Verify vendor belongs to the tenant
    try {
        const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { tenantId: true } });
        if (!vendor) return { success: false, message: 'Vendor not found.' };
        if (vendor.tenantId !== tenantId) return { success: false, message: 'Authorization Error.' };
    } catch (error) {
        // Handle DB error
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
        // Handle DB errors (connection, unique constraint)
        return { success: false, message: 'Database Error: Failed to update vendor.' /* + specific error handling */ };
    }
}

// --- Delete Vendor for the current tenant ---
export async function deleteVendor(id: string): Promise<ActionResult> {
   const tenantId = await getTenantId();
   if (!tenantId) return { success: false, message: 'Tenant ID not found.' };
   if (!id) return { success: false, message: "Vendor ID missing." };

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
        if (checkPrismaInitError(error, `deleteVendor (${id}, Tenant: ${tenantId})`)) {
           return { success: false, message: 'Database Connection Error.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] Failed to delete vendor ${id} for tenant ${tenantId}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             return { success: false, message: 'Vendor not found.', error: error.code };
         }
        return { success: false, message: 'Database Error: Failed to delete vendor.' };
   }
}
