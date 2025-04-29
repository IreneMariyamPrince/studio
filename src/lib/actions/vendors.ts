
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { vendorSchema, vendorFormSchema, VendorSchema } from '@/lib/schemas/vendor';
import { Prisma } from '@prisma/client';

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: any;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};

// Centralized flag to track if a critical init error occurred
let prismaInitializationFailed = false;
let libsslErrorLogged = false; // Flag to log libssl error only once per request cycle

// Helper function to check and log Prisma init errors
function checkPrismaInitError(error: unknown, context: string): boolean {
     if (error instanceof Prisma.PrismaClientInitializationError) {
         prismaInitializationFailed = true; // Set the flag
         console.error(`[ACTION_ERROR] Prisma Initialization Error in ${context}:`, error.message);
         if (error.message.includes('libssl') && !libsslErrorLogged) {
             console.error("DATABASE CONNECTION FAILED: Prisma cannot find the required `libssl` system library (e.g., libssl.so.1.1). This is an ENVIRONMENT ISSUE. Please ensure OpenSSL 1.1 is installed and accessible in your deployment environment.");
             libsslErrorLogged = true; // Prevent repeated logging
         } else if (!error.message.includes('libssl')) {
             console.error(`DATABASE CONNECTION FAILED (${context}): Prisma failed to initialize. Check database connection details and server logs.`);
         }
         return true; // Indicate an init error occurred
     }
     return false; // Not an init error
}

// --- Get Vendors ---
export async function getVendors(): Promise<VendorSchema[]> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

  try {
    const vendors = await prisma.vendor.findMany({
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
     if (checkPrismaInitError(error, 'getVendors')) {
          console.warn("Returning empty vendors list due to database connection failure.");
     } else {
        console.error("[ACTION_ERROR] Error fetching vendors:", error);
     }
    return [];
  }
}

// --- Add Vendor ---
export async function addVendor(formData: FormData): Promise<ActionResult> {
  // Reset flags for this request
  prismaInitializationFailed = false;
  libsslErrorLogged = false;

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
    console.error("[VALIDATION_ERROR] addVendor:", fieldErrors);
    return { success: false, message: 'Validation failed.', error: "Validation Error", fieldErrors };
  }

  try {
    const newVendor = await prisma.vendor.create({
      data: validatedFields.data,
    });

    revalidatePath('/vendors'); // Revalidate the vendor list page
    revalidatePath('/expenses/new'); // Revalidate new expense page if vendor dropdown is there
    return { success: true, message: `Vendor "${newVendor.name}" added successfully.`, data: newVendor };
  } catch (error: unknown) {
    if (checkPrismaInitError(error, 'addVendor')) {
        return { success: false, message: 'Database Connection Error. Failed to add vendor.', error: 'Initialization Error' };
    }
     console.error("[DB_ERROR] Failed to add vendor:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('email')) {
         return {
             success: false,
             message: 'Database Error: A vendor with this email already exists.',
             error: error.code,
             fieldErrors: { email: ['This email is already registered.'] }
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

// --- Update Vendor ---
export async function updateVendor(formData: FormData): Promise<ActionResult> {
  // Placeholder: Implement update logic
   console.log("Update vendor action called (Not Implemented)", Object.fromEntries(formData.entries()));
    const vendorId = formData.get('id') as string;
   if (!vendorId) return { success: false, message: "Vendor ID missing." };
   // Validation, Prisma update, revalidation...
  return { success: false, message: 'Update Vendor - Not Implemented Yet' };
}

// --- Delete Vendor ---
export async function deleteVendor(id: string): Promise<ActionResult> {
  // Placeholder: Implement delete logic
   console.log("Delete vendor action called (Not Implemented)", id);
    if (!id) return { success: false, message: "Vendor ID missing." };
   // Check for related expenses (onDelete: SetNull allows deletion, but maybe warn?)
   // Prisma delete, revalidation...
  return { success: false, message: 'Delete Vendor - Not Implemented Yet' };
}
