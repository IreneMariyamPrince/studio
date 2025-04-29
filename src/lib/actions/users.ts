
'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { userSchema, userFormSchema, UserSchema, userRoles } from '@/lib/schemas/user';
import { getTenantId, getUserId, isSuperAdmin } from '@/lib/utils/tenant'; // Tenant/user context helpers

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: UserSchema | UserSchema[] | null;
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


// --- Get Users (Context-Aware: Tenant Admin gets tenant users, Super Admin gets all) ---
export async function getUsers(): Promise<ActionResult> {
  const currentUserId = await getUserId(); // Optional: Exclude self?
  const currentUserIsSuper = await isSuperAdmin();
  const currentTenantId = await getTenantId();

  if (!currentUserIsSuper && !currentTenantId) {
       return { success: false, message: 'Unauthorized: Tenant context required.' };
  }

  const context = currentUserIsSuper ? 'getUsers (SuperAdmin)' : `getUsers (Tenant: ${currentTenantId})`;

  try {
    const whereClause: Prisma.UserWhereInput = {};
    if (!currentUserIsSuper) {
        // Tenant Admin/User: Only see users within their own tenant
        whereClause.tenantId = currentTenantId;
    }
    // Super Admin sees all users (tenantId can be null or match any tenant)

    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      // include: { tenant: { select: { id: true, name: true } } } // Optionally include tenant info
    });

    return { success: true, message: 'Users fetched successfully.', data: users.map(u => userSchema.parse(u)) };
  } catch (error) {
    if (checkPrismaInitError(error, context)) {
        return { success: false, message: 'Database Connection Error. Failed to fetch users.', error: 'Initialization Error' };
    }
    console.error(`[ACTION_ERROR] ${context}:`, error);
    return { success: false, message: 'Failed to fetch users.', error };
  }
}

// --- Invite/Add User (Context-Aware) ---
export async function addUser(formData: FormData): Promise<ActionResult> {
    const currentUserIsSuper = await isSuperAdmin();
    const currentTenantId = await getTenantId();

    if (!currentUserIsSuper && !currentTenantId) {
       return { success: false, message: 'Unauthorized: Tenant context required to add user.' };
    }

    const rawData = Object.fromEntries(formData.entries());

    // Tenant ID to assign: Current tenant for Admins, or specified for SuperAdmins
    const targetTenantId = currentUserIsSuper
                           ? rawData.tenantId as string // Super Admin specifies target tenant
                           : currentTenantId; // Tenant Admin adds to their own tenant

    if (currentUserIsSuper && !targetTenantId) {
         return { success: false, message: 'Target Tenant ID is required for Super Admin user creation.' };
    }

     // Validate that targetTenantId exists if provided by SuperAdmin
    if (currentUserIsSuper && targetTenantId) {
        try {
             const tenantExists = await prisma.tenant.findUnique({ where: { id: targetTenantId } });
             if (!tenantExists) return { success: false, message: `Target tenant (${targetTenantId}) not found.` };
        } catch (error) {
             if (checkPrismaInitError(error, `addUser - Tenant Validation`)) {
                 return { success: false, message: 'Database Connection Error during tenant validation.' };
             }
             console.error(`[DB_ERROR] Error validating target tenant:`, error);
             return { success: false, message: 'Error validating target tenant.' };
        }
    }


    const validatedFields = userFormSchema.safeParse({
        email: rawData.email,
        name: rawData.name || undefined,
        role: rawData.role, // Ensure role is within allowed enum values
        isActive: rawData.isActive ? rawData.isActive === 'true' : true,
        // Do NOT allow setting isSuperAdmin via this form
    });

    if (!validatedFields.success) {
        const fieldErrors = validatedFields.error.flatten().fieldErrors;
        console.error(`[VALIDATION_ERROR] addUser (${currentUserIsSuper ? 'SuperAdmin' : `Tenant: ${currentTenantId}`}):`, fieldErrors);
        return { success: false, message: 'Validation failed.', error: 'Validation Error', fieldErrors };
    }

    // Prevent Tenant Admins from creating Admins? (Business logic)
    // if (!currentUserIsSuper && validatedFields.data.role === 'Admin') {
    //     return { success: false, message: 'Only Super Admins can create Admin users.' };
    // }

    const context = `addUser (${currentUserIsSuper ? `SuperAdmin -> Tenant ${targetTenantId}` : `Tenant: ${currentTenantId}`})`;
    try {
        // TODO: Handle password creation/invitation flow if not using external auth provider like Firebase Auth
        const newUser = await prisma.user.create({
            data: {
                ...validatedFields.data,
                tenantId: targetTenantId, // Assign to the correct tenant
                isSuperAdmin: false, // Ensure new users aren't super admins by default
            },
        });

        revalidatePath(currentUserIsSuper ? '/superadmin/users' : '/settings'); // Revalidate appropriate user list
        return { success: true, message: 'User added successfully.', data: userSchema.parse(newUser) };

    } catch (error) {
        if (checkPrismaInitError(error, context)) {
            return { success: false, message: 'Database Connection Error. Failed to add user.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] ${context}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Usually email uniqueness
             return { success: false, message: 'A user with this email already exists.', error: error.code, fieldErrors: { email: ['Email already in use.'] } };
        }
        return { success: false, message: 'Failed to add user.', error };
    }
}

// --- Update User (Context-Aware) ---
const updateUserFormSchema = userFormSchema.extend({ id: z.string().cuid() });

export async function updateUser(formData: FormData): Promise<ActionResult> {
    const currentUserIsSuper = await isSuperAdmin();
    const currentTenantId = await getTenantId();
    const targetUserId = formData.get('id') as string;

    if (!targetUserId) return { success: false, message: 'User ID missing.' };
    if (!currentUserIsSuper && !currentTenantId) {
       return { success: false, message: 'Unauthorized: Context required.' };
    }
    const context = `updateUser (ID: ${targetUserId}, ${currentUserIsSuper ? 'SuperAdmin' : `Tenant: ${currentTenantId}`})`;

    // Fetch user to check ownership/permissions
    let targetUser;
    try {
         targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { tenantId: true, isSuperAdmin: true, role: true } }); // Added role fetch
         if (!targetUser) return { success: false, message: 'User not found.' };
         // Tenant Admin can only update users in their tenant, and cannot modify super admins
         if (!currentUserIsSuper && (targetUser.tenantId !== currentTenantId || targetUser.isSuperAdmin)) {
              return { success: false, message: 'Unauthorized to update this user.' };
         }
    } catch (error) {
         if(checkPrismaInitError(error, `${context} - Ownership Check`)) {
             return { success: false, message: 'Database Connection Error during user verification.' };
         }
         console.error(`[DB_ERROR] Error verifying user in ${context}:`, error);
         return { success: false, message: 'Database error verifying user.' };
    }


    const rawData = Object.fromEntries(formData.entries());
    const validatedFields = updateUserFormSchema.safeParse({
        id: targetUserId,
        email: rawData.email, // Consider if email changes should be allowed/handled carefully
        name: rawData.name || undefined,
        role: rawData.role,
        isActive: rawData.isActive ? rawData.isActive === 'true' : true,
        // Super Admin specific: Optionally allow changing tenantId or isSuperAdmin flag (handle with extreme care)
    });

     if (!validatedFields.success) {
        const fieldErrors = validatedFields.error.flatten().fieldErrors;
         console.error(`[VALIDATION_ERROR] ${context}:`, fieldErrors);
        return { success: false, message: 'Validation failed.', error: 'Validation Error', fieldErrors };
    }

     // Prevent Tenant Admins from promoting users to Admin or changing critical fields
     if (!currentUserIsSuper) {
          if (validatedFields.data.role === 'Admin' && targetUser.role !== 'Admin') {
                // Prevent promotion to Admin by Tenant Admin (example logic)
                 console.warn(`[AUTH_WARN] ${context}: Tenant admin attempting to promote user to Admin.`);
                return { success: false, message: 'Unauthorized to promote user to Admin role.' };
          }
          // Disallow changing email if needed
          // if (validatedFields.data.email !== targetUser.email) { ... }
     }

    const { id, ...updateData } = validatedFields.data;

    try {
        const updatedUser = await prisma.user.update({
            where: { id: id },
            data: updateData, // Apply validated changes
        });

        revalidatePath(currentUserIsSuper ? '/superadmin/users' : '/settings');
        return { success: true, message: 'User updated successfully.', data: userSchema.parse(updatedUser) };
    } catch (error) {
         if (checkPrismaInitError(error, context)) {
            return { success: false, message: 'Database Connection Error. Failed to update user.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] ${context}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
             if (error.code === 'P2002') { // Email unique constraint
                 return { success: false, message: 'This email is already in use by another user.', error: error.code, fieldErrors: { email: ['Email already in use.'] } };
             }
             if (error.code === 'P2025') { // Record not found
                 return { success: false, message: 'User not found.', error: error.code };
             }
        }
        return { success: false, message: 'Failed to update user.', error };
    }
}

// --- Delete User (Context-Aware) ---
export async function deleteUser(id: string): Promise<ActionResult> {
    const currentUserIsSuper = await isSuperAdmin();
    const currentTenantId = await getTenantId();
    const currentUserId = await getUserId();

    if (!id) return { success: false, message: 'User ID missing.' };
    if (!currentUserIsSuper && !currentTenantId) {
       return { success: false, message: 'Unauthorized: Context required.' };
    }
     if (id === currentUserId) {
        return { success: false, message: 'Cannot delete yourself.' }; // Prevent self-deletion
    }
     const context = `deleteUser (ID: ${id}, ${currentUserIsSuper ? 'SuperAdmin' : `Tenant: ${currentTenantId}`})`;

    // Fetch user to check ownership/permissions
    let targetUser;
    try {
         targetUser = await prisma.user.findUnique({ where: { id: id }, select: { tenantId: true, isSuperAdmin: true } });
         if (!targetUser) return { success: false, message: 'User not found.' };
         // Tenant Admin can only delete users in their tenant, and cannot delete super admins
         if (!currentUserIsSuper && (targetUser.tenantId !== currentTenantId || targetUser.isSuperAdmin)) {
              return { success: false, message: 'Unauthorized to delete this user.' };
         }
          // Prevent deleting super admins entirely? Or only allow other super admins?
         if (targetUser.isSuperAdmin && !currentUserIsSuper) { // Strict: Only super admins can delete super admins
              console.warn(`[AUTH_WARN] ${context}: Tenant admin attempting to delete Super Admin.`);
             return { success: false, message: 'Unauthorized to delete a Super Admin user.' };
         }
    } catch (error) {
         if(checkPrismaInitError(error, `${context} - Ownership Check`)) {
             return { success: false, message: 'Database Connection Error during user verification.' };
         }
         console.error(`[DB_ERROR] Error verifying user for deletion in ${context}:`, error);
         return { success: false, message: 'Database error verifying user for deletion.' };
    }

    try {
        // Consider what happens to records created by this user (e.g., Journal Entries)
        // The schema uses onDelete: SetNull for createdById, so the records will remain.
        await prisma.user.delete({ where: { id: id } });

        revalidatePath(currentUserIsSuper ? '/superadmin/users' : '/settings');
        return { success: true, message: 'User deleted successfully.' };
    } catch (error) {
        if (checkPrismaInitError(error, context)) {
            return { success: false, message: 'Database Connection Error. Failed to delete user.', error: 'Initialization Error' };
        }
        console.error(`[DB_ERROR] ${context}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return { success: false, message: 'User not found.', error: error.code };
        }
        return { success: false, message: 'Failed to delete user.', error };
    }
}
