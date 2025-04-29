
import { headers } from 'next/headers';
// import { auth } from '@/auth'; // Replace with your actual authentication library import if used server-side

/**
 * Retrieves the tenant ID for the current request context, primarily from headers set by middleware.
 *
 * @returns {Promise<string | null>} The tenant ID or null if not found/applicable.
 */
export async function getTenantId(): Promise<string | null> {
    const headersList = headers();
    const tenantIdHeader = headersList.get('x-tenant-id');

    if (tenantIdHeader) {
        return tenantIdHeader;
    }

    // Fallback or direct session check if middleware isn't guaranteed
    // const session = await auth();
    // if (session?.user?.tenantId) {
    //    console.warn("Tenant ID fetched from session, header not found."); // Log if header was missed
    //    return session.user.tenantId;
    // }

    console.warn("Tenant ID could not be determined from headers (or session fallback).");
    return null; // Return null if not found via header
}

/**
 * Retrieves the user ID for the current request context, primarily from headers set by middleware.
 *
 * @returns {Promise<string | null>} The user ID or null if not found.
 */
export async function getUserId(): Promise<string | null> {
    const headersList = headers();
    const userIdHeader = headersList.get('x-user-id');

    if (userIdHeader) {
        return userIdHeader;
    }

    // Fallback or direct session check
    // const session = await auth();
    // if (session?.user?.id) {
    //    console.warn("User ID fetched from session, header not found.");
    //    return session.user.id;
    // }

    console.warn("User ID could not be determined from headers (or session fallback).");
    return null;
}

/**
 * Retrieves the user role for the current request context, primarily from headers set by middleware.
 *
 * @returns {Promise<string | null>} The user role or null if not found.
 */
export async function getUserRole(): Promise<string | null> {
    const headersList = headers();
    const userRoleHeader = headersList.get('x-user-role');

    if (userRoleHeader) {
        return userRoleHeader;
    }

    // Fallback or direct session check
    // const session = await auth();
    // if (session?.user?.role) {
    //    console.warn("User role fetched from session, header not found.");
    //    return session.user.role;
    // }


    console.warn("User role could not be determined from headers (or session fallback).");
    return null;
}

/**
 * Checks if the current user is a Super Admin, primarily from headers set by middleware.
 *
 * @returns {Promise<boolean>} True if the user is a Super Admin, false otherwise.
 */
export async function isSuperAdmin(): Promise<boolean> {
     const headersList = headers();
     const isSuperAdminHeader = headersList.get('x-is-super-admin');

     if (isSuperAdminHeader) {
        return isSuperAdminHeader === 'true';
     }

    // Fallback or direct session check
    // const session = await auth();
    // if (session?.user?.isSuperAdmin !== undefined) { // Check if the property exists
    //     console.warn("Super Admin status fetched from session, header not found.");
    //     return session.user.isSuperAdmin;
    // }

    console.warn("Super Admin status could not be determined from headers (or session fallback). Defaulting to false.");
    return false; // Default to false if header isn't set
}

    