
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Placeholder for authentication/session checking logic
// In a real app, replace this with your actual auth library (e.g., NextAuth.js, Firebase Auth, Clerk)
async function getUserSession(request: NextRequest): Promise<{ userId: string; tenantId: string | null; isSuperAdmin: boolean; role: string } | null> {
    // Example: Read a session cookie or token
    const sessionToken = request.cookies.get('sessionToken')?.value;

    // --- MOCK SESSION DATA ---
    // Simulate a logged-in tenant user by default for testing purposes.
    // To test super admin, change isSuperAdmin to true and tenantId to null.
    // To test unauthenticated, return null.
    const mockTenantUserSession = { userId: 'user-123', tenantId: 'tenant-abc', isSuperAdmin: false, role: 'Admin' };
    // const mockSuperAdminSession = { userId: 'super-001', tenantId: null, isSuperAdmin: true, role: 'Admin' };
    // return null; // Simulate unauthenticated
    return mockTenantUserSession; // Simulate authenticated tenant user

    // --- REAL IMPLEMENTATION (Example) ---
    // if (!sessionToken) return null;
    // try {
    //     // const userData = await validateSessionAndGetUser(sessionToken); // Replace with actual call
    //     // return userData;
    // } catch (error) {
    //     console.error("Session validation failed:", error);
    //     // Optionally clear the invalid cookie
    //     const response = NextResponse.next();
    //     response.cookies.delete('sessionToken');
    //     // It might be better to redirect to login here rather than just returning null
    //     // return NextResponse.redirect(new URL('/login', request.url));
    //     return null;
    // }
}

// Function to extract tenant identifier (example: from subdomain)
function getTenantIdFromRequest(request: NextRequest): string | null {
    const hostname = request.headers.get('host') || '';
    // Example: tenant-abc.localhost:9002 -> tenant-abc
    // Adjust this logic based on your multi-tenancy strategy
    const parts = hostname.split('.');
     // Check if the first part looks like a tenant ID (e.g., not 'www', 'localhost')
     // and if there are enough parts (e.g., tenant.domain.com or tenant.localhost)
    if (parts.length >= 2 && parts[0] !== 'www' && !['localhost', '127'].some(p => parts[0].startsWith(p)) ) {
        // More robust check might involve checking against a known list or format
         if (!hostname.includes('cloudworkstations.dev')) { // Avoid matching development URLs
             return parts[0];
         }
    }
    return null; // Return null if no tenant subdomain detected
}

// List of public paths that don't require authentication or tenant context
const publicPaths = ['/login', '/signup', '/api/auth', '/unauthorized', '/forbidden']; // Ensure error pages are public

// List of paths accessible only by Super Admins
const superAdminPaths = ['/superadmin', '/manage-tenants']; // Add more if needed

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Skip middleware for Next.js internal paths and public paths
    if (pathname.startsWith('/_next') || pathname.startsWith('/static') || publicPaths.some(p => pathname.startsWith(p))) {
        console.log(`[Middleware] Skipping public path: ${pathname}`);
        return NextResponse.next();
    }

    // 1. Get User Session
    console.log(`[Middleware] Checking session for path: ${pathname}`);
    const session = await getUserSession(request);

    // Redirect to login if no session found for protected routes
    if (!session) {
        console.log(`[Middleware] No session found. Redirecting to login.`);
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname); // Optional: redirect back after login
        return NextResponse.redirect(loginUrl);
    }

    console.log(`[Middleware] Session found: User ${session.userId}, Tenant ${session.tenantId}, SuperAdmin ${session.isSuperAdmin}`);

    // 2. Handle Super Admin Access
    if (session.isSuperAdmin) {
        console.log(`[Middleware] Super Admin access allowed for path: ${pathname}`);
        // Optional: Could add checks here if certain paths are NOT for super admins
        return NextResponse.next(); // Super admins bypass tenant checks
    }

    // 3. Handle Tenant User Access
    // Ensure non-super admins have a tenant ID in their session
    if (!session.tenantId) {
         console.warn(`[Middleware] User ${session.userId} without tenantId trying to access protected path ${pathname}. Redirecting to unauthorized.`);
         return NextResponse.redirect(new URL('/unauthorized?reason=no_tenant', request.url));
    }

    // Check if accessing a super admin path without being a super admin
     if (superAdminPaths.some(p => pathname.startsWith(p))) {
         console.warn(`[Middleware] Tenant user ${session.userId} trying to access super admin path ${pathname}. Redirecting to forbidden.`);
          return NextResponse.redirect(new URL('/forbidden?reason=superadmin_only', request.url));
     }

    // Optional: Tenant ID consistency check (if using subdomains/paths for tenancy)
    const requestTenantId = getTenantIdFromRequest(request);
    if (requestTenantId) {
        console.log(`[Middleware] Request Tenant ID derived: ${requestTenantId}`);
        if (requestTenantId !== session.tenantId) {
            console.warn(`[Middleware] Tenant mismatch: User ${session.userId} (Tenant ${session.tenantId}) accessing Tenant ${requestTenantId} at ${pathname}. Redirecting to unauthorized.`);
            // Redirect to an error page indicating tenant mismatch
            return NextResponse.redirect(new URL('/unauthorized?reason=tenant_mismatch', request.url));
        }
    } else {
        console.log(`[Middleware] No specific tenant ID derived from request hostname for path: ${pathname}`);
        // If your model REQUIRES accessing via a tenant subdomain/path, you might redirect here.
        // Otherwise, allow access based on session tenant ID.
    }


     // 4. Authorization based on Role (Example)
     if (pathname.startsWith('/settings') && session.role === 'Viewer') {
         console.warn(`[Middleware] Authorization denied: User ${session.userId} (Role ${session.role}) accessing ${pathname}. Redirecting to forbidden.`);
         return NextResponse.redirect(new URL('/forbidden?reason=role_denied', request.url));
     }
     // Add more role-based checks as needed for specific routes

    // 5. Add user/tenant context to request headers for downstream use
    console.log(`[Middleware] Access granted for User ${session.userId} (Tenant ${session.tenantId}) to path: ${pathname}. Setting headers.`);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', session.tenantId);
    requestHeaders.set('x-user-id', session.userId);
    requestHeaders.set('x-user-role', session.role);
     requestHeaders.set('x-is-super-admin', String(session.isSuperAdmin)); // Add super admin flag

    // Proceed with the request, adding modified headers
    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

// Define paths where the middleware should run
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes) - Apply middleware selectively if needed for API auth/tenant scoping
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};

    