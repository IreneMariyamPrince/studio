

'use server';

import { revalidatePath } from 'next/cache';
import { Collection, ObjectId, WithId, MongoServerError } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { userSchema, userFormSchema, UserSchema, userRoles } from '@/lib/schemas/user';
import { getTenantId, getUserId, isSuperAdmin } from '@/lib/utils/tenant';
import { z } from 'zod'; // Ensure z is imported

// Type definition for MongoDB documents
type UserDocument = Omit<UserSchema, 'id' | 'tenantId'> & {
    _id?: ObjectId;
    tenantId?: string | null; // Keep as string from session/middleware
    createdById?: ObjectId | null;
    createdAt?: Date;
    updatedAt?: Date;
};


// Helper to get collections
async function getUsersCollection(): Promise<Collection<UserDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<UserDocument>('users');
}
async function getTenantsCollection(): Promise<Collection<any>> {
    const { db } = await connectToDatabase();
    return db.collection('tenants');
}

// Type definition for action results
type ActionResult = {
    success: boolean;
    message: string;
    data?: UserSchema | UserSchema[] | null;
    error?: unknown;
    fieldErrors?: Record<string, string[]>
};


// --- Get Users (Context-Aware) ---
export async function getUsers(): Promise<ActionResult> {
  const currentUserIdString = await getUserId();
  const currentUserIsSuper = await isSuperAdmin();
  const currentTenantId = await getTenantId(); // This is string | null

  if (!currentUserIsSuper && !currentTenantId) {
       return { success: false, message: 'Unauthorized: Tenant context required.' };
  }

  const context = currentUserIsSuper ? 'getUsers (SuperAdmin)' : `getUsers (Tenant: ${currentTenantId})`;

  try {
    const usersCollection = await getUsersCollection();
    const query: any = {};
    if (!currentUserIsSuper) {
        // Tenant Admin/User: Only see users within their own tenant
        query.tenantId = currentTenantId; // Match the string tenantId
    }
    // Super Admin sees all users (no tenantId filter needed, or handle explicitly if needed)

    const usersCursor = usersCollection.find(query).sort({ name: 1 });
    const usersArray = await usersCursor.toArray();

     const parsedUsers = usersArray.map(u => {
        // Serialize dates before parsing
         const serializableUser = {
             ...u,
             id: u._id?.toHexString(),
             tenantId: u.tenantId ?? undefined, // Handle null/undefined tenantId for super admins potentially
             name: u.name ?? undefined,
             firebaseUid: u.firebaseUid ?? undefined,
             createdAt: u.createdAt?.toISOString(),
             updatedAt: u.updatedAt?.toISOString(),
         };
         return userSchema.parse(serializableUser);
     });

    return { success: true, message: 'Users fetched successfully.', data: parsedUsers };
  } catch (error) {
    console.error(`[ACTION_ERROR] ${context}:`, error);
    return { success: false, message: 'Failed to fetch users.', error };
  }
}

// --- Invite/Add User (Context-Aware) ---
export async function addUser(formData: FormData): Promise<ActionResult> {
    const currentUserIsSuper = await isSuperAdmin();
    const currentTenantId = await getTenantId(); // string | null

    if (!currentUserIsSuper && !currentTenantId) {
       return { success: false, message: 'Unauthorized: Tenant context required to add user.' };
    }

    const rawData = Object.fromEntries(formData.entries());

    // Tenant ID to assign (string | null)
    const targetTenantId = currentUserIsSuper
                           ? (rawData.tenantId as string) || null // Super Admin specifies target tenant (can be null)
                           : currentTenantId; // Tenant Admin adds to their own tenant

    // If Super Admin is creating a non-super admin, targetTenantId must be specified and exist
    if (currentUserIsSuper && !targetTenantId) {
         // Allow Super Admin creation without tenantId ONLY if making another Super Admin?
         // This logic depends on requirements. For now, let's assume non-super needs a tenant.
         // We also prevent setting isSuperAdmin via this form directly.
         return { success: false, message: 'Target Tenant ID is required for Super Admin user creation.', fieldErrors: { tenantId: ['Tenant ID required.'] } };
    }

     // Validate that targetTenantId exists if provided
    if (targetTenantId) {
        try {
             const tenantsCollection = await getTenantsCollection();
             // Assume tenantId stored on user is string, matching tenant 'id' string if needed
             // If tenants collection uses ObjectId, convert targetTenantId
             // let targetTenantObjectId;
             // try { targetTenantObjectId = new ObjectId(targetTenantId); } catch { throw new Error("Invalid Tenant ID format"); }
             const tenantExists = await tenantsCollection.findOne({ id: targetTenantId }, { projection: { _id: 1 }}); // Adjust query based on Tenant schema ID field
             if (!tenantExists) return { success: false, message: `Target tenant (${targetTenantId}) not found.`, fieldErrors: { tenantId: ['Tenant not found.'] } };
        } catch (error) {
             console.error(`[DB_ERROR] Error validating target tenant:`, error);
             return { success: false, message: 'Error validating target tenant.' };
        }
    }


    const validatedFields = userFormSchema.safeParse({
        email: rawData.email,
        name: rawData.name || undefined,
        role: rawData.role,
        isActive: rawData.isActive ? rawData.isActive === 'true' : true,
    });

    if (!validatedFields.success) { /* handle error */ }

    // Prevent Tenant Admins from creating Admins (example logic)
    if (!currentUserIsSuper && validatedFields.data.role === 'Admin') {
         return { success: false, message: 'Only Super Admins can create Admin users for a tenant.' };
    }

    const context = `addUser (${currentUserIsSuper ? `SuperAdmin -> Tenant ${targetTenantId}` : `Tenant: ${currentTenantId}`})`;
    try {
         const usersCollection = await getUsersCollection();

         // Check for existing email
         const existingUser = await usersCollection.findOne({ email: validatedFields.data.email });
         if (existingUser) {
             return { success: false, message: 'A user with this email already exists.', error: 'Duplicate Key', fieldErrors: { email: ['Email already in use.'] } };
         }

        // TODO: Handle password creation/invitation flow
        const newUserDocument: Omit<UserDocument, '_id'> = {
                ...validatedFields.data,
                tenantId: targetTenantId, // Assign target tenant (string or null)
                isSuperAdmin: false, // Cannot set via this form
                createdAt: new Date(),
                updatedAt: new Date(),
            };

        const result = await usersCollection.insertOne(newUserDocument);
        if (!result.insertedId) throw new Error("Failed to insert user.");

         const serializableNewUser = {
             ...newUserDocument,
             id: result.insertedId.toHexString(),
             createdAt: newUserDocument.createdAt.toISOString(),
             updatedAt: newUserDocument.updatedAt.toISOString(),
         };

        revalidatePath(currentUserIsSuper ? '/superadmin/users' : '/settings');
        return { success: true, message: 'User added successfully.', data: userSchema.parse(serializableNewUser) };

    } catch (error) {
        console.error(`[DB_ERROR] ${context}:`, error);
        // Handle duplicate email error from MongoDB index
        if (error instanceof MongoServerError && error.code === 11000 && error.message.includes('email')) {
             return { success: false, message: 'A user with this email already exists.', error: 'Duplicate Key', fieldErrors: { email: ['Email already in use.'] } };
        }
        return { success: false, message: 'Failed to add user.', error };
    }
}

// --- Update User (Context-Aware) ---
const updateUserFormSchema = userFormSchema.extend({
    id: z.string().refine((val) => ObjectId.isValid(val), { message: "Invalid user ID." }),
 });

export async function updateUser(formData: FormData): Promise<ActionResult> {
    const currentUserIsSuper = await isSuperAdmin();
    const currentTenantId = await getTenantId(); // string | null
    const targetUserIdString = formData.get('id') as string;

    if (!targetUserIdString) return { success: false, message: 'User ID missing.' };
    if (!currentUserIsSuper && !currentTenantId) return { success: false, message: 'Unauthorized: Context required.' };
    const context = `updateUser (ID: ${targetUserIdString}, ${currentUserIsSuper ? 'SuperAdmin' : `Tenant: ${currentTenantId}`})`;

    let targetUserId: ObjectId;
    try { targetUserId = new ObjectId(targetUserIdString); }
    catch { return { success: false, message: 'Invalid User ID format.' }; }

    // Fetch user to check ownership/permissions
    let targetUser: WithId<UserDocument> | null = null;
    try {
         const usersCollection = await getUsersCollection();
         targetUser = await usersCollection.findOne({ _id: targetUserId });
         if (!targetUser) return { success: false, message: 'User not found.' };

         // Authorization checks
         if (!currentUserIsSuper && (targetUser.tenantId !== currentTenantId || targetUser.isSuperAdmin)) {
              return { success: false, message: 'Unauthorized to update this user.' };
         }
    } catch (error) {
         console.error(`[DB_ERROR] Error verifying user in ${context}:`, error);
         return { success: false, message: 'Database error verifying user.' };
    }


    const rawData = Object.fromEntries(formData.entries());
    const validatedFields = updateUserFormSchema.safeParse({
        id: targetUserIdString, // validate string id format
        email: rawData.email, // Email changes might need extra logic (verification)
        name: rawData.name || undefined,
        role: rawData.role,
        isActive: rawData.isActive ? rawData.isActive === 'true' : true,
        // Super Admin specific: Allow changing tenantId or isSuperAdmin? VERY DANGEROUS
        // tenantId: currentUserIsSuper ? rawData.tenantId || null : undefined, // Example if allowed
    });

     if (!validatedFields.success) { /* handle validation error */ }

     // Prevent Tenant Admins from promoting users to Admin
     if (!currentUserIsSuper && validatedFields.data.role === 'Admin' && targetUser.role !== 'Admin') {
         return { success: false, message: 'Unauthorized to promote user to Admin role.' };
     }
     // Prevent changing critical flags like isSuperAdmin unless explicitly allowed for super admins
     // let isSuperAdminUpdate = targetUser.isSuperAdmin; // Keep existing value
     // if (currentUserIsSuper && rawData.isSuperAdmin !== undefined) {
     //     isSuperAdminUpdate = rawData.isSuperAdmin === 'true';
     // }

    const { id, ...updateData } = validatedFields.data; // Exclude string id

    try {
         const usersCollection = await getUsersCollection();

         // Check for email conflict if email is changing
         if (updateData.email && updateData.email !== targetUser.email) {
             const existingEmail = await usersCollection.findOne({ _id: { $ne: targetUserId }, email: updateData.email });
             if (existingEmail) {
                 return { success: false, message: 'This email is already in use.', fieldErrors: { email: ['Email already in use.'] } };
             }
         }

        const result = await usersCollection.updateOne(
            { _id: targetUserId }, // Use ObjectId for matching
            {
                $set: {
                    ...updateData,
                    // tenantId: targetTenantId, // Apply if tenant change is allowed
                    // isSuperAdmin: isSuperAdminUpdate, // Apply if super admin change allowed
                    updatedAt: new Date()
                 }
            }
        );

        if (result.matchedCount === 0) {
            return { success: false, message: 'User not found during update.', error: 'Not Found' };
        }
        if (result.modifiedCount === 0) {
            return { success: true, message: 'User details unchanged.' };
        }

        revalidatePath(currentUserIsSuper ? '/superadmin/users' : '/settings');
         const updatedUserDoc = await usersCollection.findOne({ _id: targetUserId });
          const returnData = updatedUserDoc ? userSchema.parse({
             ...updatedUserDoc,
             id: updatedUserDoc._id.toHexString(),
             tenantId: updatedUserDoc.tenantId ?? undefined,
             createdAt: updatedUserDoc.createdAt?.toISOString(),
             updatedAt: updatedUserDoc.updatedAt?.toISOString(),
          }) : null;
        return { success: true, message: 'User updated successfully.', data: returnData };
    } catch (error) {
        console.error(`[DB_ERROR] ${context}:`, error);
        // Handle duplicate email error from index
        if (error instanceof MongoServerError && error.code === 11000 && error.message.includes('email')) {
             return { success: false, message: 'This email is already in use.', fieldErrors: { email: ['Email already in use.'] } };
        }
        return { success: false, message: 'Failed to update user.', error };
    }
}

// --- Delete User (Context-Aware) ---
export async function deleteUser(idString: string): Promise<ActionResult> {
    const currentUserIsSuper = await isSuperAdmin();
    const currentTenantId = await getTenantId(); // string | null
    const currentUserIdString = await getUserId(); // string | null

    if (!idString) return { success: false, message: 'User ID missing.' };
    if (!currentUserIsSuper && !currentTenantId) return { success: false, message: 'Unauthorized: Context required.' };
     if (idString === currentUserIdString) { // Compare string IDs
        return { success: false, message: 'Cannot delete yourself.' };
    }
     const context = `deleteUser (ID: ${idString}, ${currentUserIsSuper ? 'SuperAdmin' : `Tenant: ${currentTenantId}`})`;

    let targetUserId: ObjectId;
    try { targetUserId = new ObjectId(idString); }
    catch { return { success: false, message: 'Invalid User ID format.' }; }

    // Fetch user to check ownership/permissions
    let targetUser: WithId<UserDocument> | null = null;
    try {
         const usersCollection = await getUsersCollection();
         targetUser = await usersCollection.findOne({ _id: targetUserId });
         if (!targetUser) return { success: false, message: 'User not found.' };

         // Authorization checks
         if (!currentUserIsSuper && (targetUser.tenantId !== currentTenantId || targetUser.isSuperAdmin)) {
             return { success: false, message: 'Unauthorized to delete this user.' };
         }
          if (targetUser.isSuperAdmin && !currentUserIsSuper) {
              return { success: false, message: 'Unauthorized to delete a Super Admin user.' };
          }
           // Optional: Prevent deletion of the *last* super admin?
            // if (targetUser.isSuperAdmin) {
            //     const superAdminCount = await usersCollection.countDocuments({ isSuperAdmin: true });
            //     if (superAdminCount <= 1) return { success: false, message: 'Cannot delete the last Super Admin.' };
            // }

    } catch (error) {
         console.error(`[DB_ERROR] Error verifying user for deletion in ${context}:`, error);
         return { success: false, message: 'Database error verifying user for deletion.' };
    }

    try {
         const usersCollection = await getUsersCollection();
        // TODO: Consider implications for data created by this user (e.g., Journal Entries createdById).
        // If using ObjectId for createdById, no direct action needed unless you want to reassign/clear.
        // If using string ID, ensure consistency.

        const result = await usersCollection.deleteOne({ _id: targetUserId });

        if (result.deletedCount === 0) {
             return { success: false, message: 'User not found during deletion.', error: 'Not Found' };
        }

        revalidatePath(currentUserIsSuper ? '/superadmin/users' : '/settings');
        return { success: true, message: 'User deleted successfully.' };
    } catch (error) {
        console.error(`[DB_ERROR] ${context}:`, error);
        return { success: false, message: 'Failed to delete user.', error };
    }
}
