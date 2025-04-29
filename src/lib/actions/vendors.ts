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

// --- Get Vendors ---
export async function getVendors(): Promise<VendorSchema[]> {
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
    }));
  } catch (error) {
     if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[ACTION_ERROR] Prisma Initialization Error fetching vendors:", error.message);
        // Add libssl check if needed
        console.error("Database connection failed.");
        return [];
    }
    console.error("[ACTION_ERROR] Error fetching vendors:", error);
    return [];
  }
}

// --- Add Vendor ---
export async function addVendor(formData: FormData): Promise<ActionResult> {
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
     console.error("[DB_ERROR] Failed to add vendor:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2002' && error.meta?.target === 'Vendor_email_key') {
         return {
             success: false,
             message: 'Database Error: A vendor with this email already exists.',
             error: error.code,
             fieldErrors: { email: ['This email is already registered.'] }
          };
       }
     } else if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[DB_ERROR] Prisma Initialization Error during vendor creation:", error.message);
        // Add libssl check if needed
        return {
            success: false,
            message: 'Database Connection Error. Failed to add vendor.',
            error: 'Initialization Error'
        };
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
