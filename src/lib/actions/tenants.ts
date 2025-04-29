
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { tenantSchema, tenantFormSchema, TenantSchema } from '@/lib/schemas/tenant';
import { Prisma } from '@prisma/client';
import { isSuperAdmin } from '@/lib/utils/tenant'; // Import check for super admin

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: TenantSchema | TenantSchema[] | null;
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

// --- Super Admin: Get All Tenants ---
export async function getAllTenants(): Promise<ActionResult> {
  if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }

  const context = 'getAllTenants';
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { name: 'asc' },
    });
    return { success: true, message: 'Tenants fetched successfully.', data: tenants.map(t => tenantSchema.parse(t)) };
  } catch (error) {
    if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error.', error: 'Initialization Error' };
    }
    console.error(`[ACTION_ERROR] ${context}:`, error);
    return { success: false, message: 'Failed to fetch tenants.', error };
  }
}

// --- Super Admin: Create Tenant ---
export async function createTenant(formData: FormData): Promise<ActionResult> {
  if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = tenantFormSchema.safeParse({
    name: rawData.name,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    return { success: false, message: 'Validation failed.', error: 'Validation Error', fieldErrors };
  }

  const context = 'createTenant';
  try {
    const newTenant = await prisma.tenant.create({
      data: validatedFields.data,
    });
    // Optionally: Create default CompanySetting entry here as well
    await prisma.companySetting.create({
        data: {
            tenantId: newTenant.id,
            companyName: newTenant.name // Default company name to tenant name
        }
    });

    revalidatePath('/superadmin/tenants'); // Or wherever tenants are listed
    return { success: true, message: `Tenant "${newTenant.name}" created successfully.`, data: tenantSchema.parse(newTenant) };
  } catch (error) {
    if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error.', error: 'Initialization Error' };
    }
    console.error(`[DB_ERROR] ${context}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, message: 'A tenant with this name already exists.', error: error.code, fieldErrors: { name: ['Name already taken.'] } };
    }
    return { success: false, message: 'Failed to create tenant.', error };
  }
}

// --- Super Admin: Update Tenant ---
export async function updateTenant(formData: FormData): Promise<ActionResult> {
   if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }

  const tenantId = formData.get('id') as string;
  if (!tenantId) return { success: false, message: 'Tenant ID missing.' };

  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = tenantFormSchema.safeParse({ name: rawData.name }); // Only name is updatable here

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    return { success: false, message: 'Validation failed.', error: 'Validation Error', fieldErrors };
  }

  const context = `updateTenant (ID: ${tenantId})`;
  try {
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: validatedFields.data,
    });
    revalidatePath('/superadmin/tenants');
    return { success: true, message: 'Tenant updated successfully.', data: tenantSchema.parse(updatedTenant) };
  } catch (error) {
    if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error.', error: 'Initialization Error' };
    }
    console.error(`[DB_ERROR] ${context}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') { // Unique constraint on name
            return { success: false, message: 'Another tenant with this name already exists.', error: error.code, fieldErrors: { name: ['Name already taken.'] } };
        }
        if (error.code === 'P2025') { // Record not found
            return { success: false, message: 'Tenant not found.', error: error.code };
        }
    }
    return { success: false, message: 'Failed to update tenant.', error };
  }
}

// --- Super Admin: Delete Tenant ---
export async function deleteTenant(id: string): Promise<ActionResult> {
   if (!await isSuperAdmin()) {
    return { success: false, message: 'Unauthorized.' };
  }
  if (!id) return { success: false, message: 'Tenant ID missing.' };

  const context = `deleteTenant (ID: ${id})`;
  try {
    // Ensure the tenant exists before attempting deletion
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
        return { success: false, message: 'Tenant not found.', error: 'P2025' };
    }

    // Use a transaction if you need to perform cleanup before deletion
    // Cascade delete should handle related records based on schema
    await prisma.tenant.delete({ where: { id } });

    revalidatePath('/superadmin/tenants');
    return { success: true, message: 'Tenant deleted successfully.' };
  } catch (error) {
     if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error.', error: 'Initialization Error' };
    }
    console.error(`[DB_ERROR] ${context}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
         return { success: false, message: 'Tenant not found.', error: error.code };
     }
    // Handle potential relation constraint errors if cascade isn't set up correctly
    return { success: false, message: 'Failed to delete tenant.', error };
  }
}
