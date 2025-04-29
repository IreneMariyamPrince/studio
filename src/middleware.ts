import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Placeholder for authentication/session checking logic
// In a real app, replace this with your actual auth library (e.g., NextAuth.js, Firebase Auth, Clerk)
async function getUserSession(request: NextRequest): Promise<{ userId: string; tenantId: string | null; isSuperAdmin: boolean; role: string } | null> {
    // Example: Read a session cookie or token
    const sessionToken = request.cookies.get('sessionToken')?.value;
    if (!sessionToken) return null;

    // Example: Validate token and fetch user data (replace with actual DB/API call)
    try {
        // const userData = await validateSessionAndGetUser(sessionToken);
        // Mock data for demonstration:
        const userData = { userId: 'user-123', tenantId: 'tenant-abc', isSuperAdmin: false, role: 'Admin' }; // Example tenant user
        // const superAdminData = { userId: 'super-001', tenantId: null, isSuperAdmin: true, role: 'Admin' }; // Example super admin
        return userData; // Replace with actual fetched data
    } catch (error) {
        console.error("Session validation failed:", error);
        return null;
    }
}

// Function to extract tenant identifier (example: from subdomain)
function getTenantIdFromRequest(request: NextRequest): string | null {
    const hostname = request.headers.get('host') || '';
    // Example: tenant1.yourapp.com -> tenant1
    // Adjust this logic based on your multi-tenancy strategy (subdomain, path, custom header)
    const parts = hostname.split('.');
    if (parts.length > 2 && parts[0] !== 'www') { // Basic subdomain check
        return parts[0];
    }
    // Could also check request.nextUrl.pathname for path-based tenancy (/tenant1/dashboard)
    return null; // Or a default tenant ID if applicable
}

// List of public paths that don't require authentication or tenant context
const publicPaths = ['/login', '/signup', '/api/auth']; // Add other public paths as needed

// List of paths accessible only by Super Admins
const superAdminPaths = ['/superadmin', '/manage-tenants'];

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Skip middleware for Next.js internal paths and public paths
    if (pathname.startsWith('/_next') || pathname.startsWith('/static') || publicPaths.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // 1. Get User Session
    const session = await getUserSession(request);

    // Redirect to login if no session found for protected routes
    if (!session) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname); // Optional: redirect back after login
        return NextResponse.redirect(loginUrl);
    }

    // 2. Handle Super Admin Access
    if (session.isSuperAdmin) {
        // Allow access to all paths, including super admin specific paths
        if (superAdminPaths.some(p => pathname.startsWith(p))) {
            // Could add logic here to ensure only super admins access these paths explicitly
        }
        return NextResponse.next(); // Super admins bypass tenant checks
    }

    // 3. Handle Tenant User Access
    const requestTenantId = getTenantIdFromRequest(request); // Get tenant from request (e.g., subdomain)

    // Check if user belongs to the tenant they are trying to access
    if (!session.tenantId) {
         console.warn(`User ${session.userId} without tenantId trying to access ${pathname}`);
         // Redirect non-superadmin users without a tenant to an error page or appropriate place
         return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // *** IMPORTANT: Validate Tenant ID Consistency ***
    // This is a crucial step depending on your tenancy model.
    // If using subdomains, ensure the user's tenant matches the subdomain.
    // If not using subdomains/paths for tenancy, this check might not be needed here,
    // as data fetching should be scoped by session.tenantId.
    if (requestTenantId && requestTenantId !== session.tenantId) {
        console.warn(`Tenant mismatch: User ${session.userId} (Tenant ${session.tenantId}) accessing Tenant ${requestTenantId} at ${pathname}`);
        // Redirect to user's own tenant dashboard or an error page
        // Option 1: Redirect to their correct tenant URL (if using subdomains/paths)
        // Option 2: Show an unauthorized page
        return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

     // 4. Authorization based on Role (Example)
     if (pathname.startsWith('/settings') && session.role === 'Viewer') {
         console.warn(`Authorization denied: User ${session.userId} (Role ${session.role}) accessing ${pathname}`);
         return NextResponse.redirect(new URL('/forbidden', request.url)); // Redirect viewers trying to access settings
     }
     // Add more role-based checks as needed

    // 5. Add tenant context to request headers (optional, for downstream use in Server Components/API routes)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', session.tenantId);
    requestHeaders.set('x-user-id', session.userId);
    requestHeaders.set('x-user-role', session.role);

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
