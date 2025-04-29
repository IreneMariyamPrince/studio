import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCog, PercentSquare, Building2, ShieldCheck, DatabaseZap } from 'lucide-react'; // Icons for tabs
import { isSuperAdmin, getTenantId } from '@/lib/utils/tenant'; // Import tenant utils
import 'server-only';

// Placeholder components for different settings sections

// --- Tenant Specific Settings ---
function CompanySettings() {
     return (
        <Card>
            <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>Manage your company's details (logo, address, etc.).</CardDescription>
            </CardHeader>
            <CardContent>
                 <p className="text-muted-foreground">Company profile settings coming soon.</p>
                 {/* Add fields for company name, address, logo upload, etc. */}
            </CardContent>
             <CardFooter>
                <Button disabled>Save Changes</Button>
            </CardFooter>
        </Card>
    );
}

function TenantUserManagement() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage users and their roles within your company.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">User management feature coming soon.</p>
                {/* Add user table, invite user button, etc. here */}
            </CardContent>
             <CardFooter>
                <Button disabled>Invite User</Button>
            </CardFooter>
        </Card>
    );
}

function TenantTaxSettings() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Tax Rates</CardTitle>
                <CardDescription>Configure tax rates for invoices and expenses for your company.</CardDescription>
            </CardHeader>
            <CardContent>
                 <p className="text-muted-foreground">Tax configuration feature coming soon.</p>
                 {/* Add tax rate table, add rate button, etc. here */}
            </CardContent>
             <CardFooter>
                <Button disabled>Add Tax Rate</Button>
            </CardFooter>
        </Card>
    );
}

// --- Super Admin Specific Settings ---
function TenantManagement() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Manage Tenants</CardTitle>
                <CardDescription>Add, view, or configure client tenants.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Tenant management feature coming soon.</p>
                {/* Add tenant list, add tenant button etc. */}
            </CardContent>
             <CardFooter>
                <Button disabled>Add New Tenant</Button>
            </CardFooter>
        </Card>
    );
}

function SuperAdminUserManagement() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Global User Management</CardTitle>
                <CardDescription>Manage all users across all tenants, including Super Admins.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Global user management feature coming soon.</p>
                {/* Add global user table, assign super admin role etc. */}
            </CardContent>
             <CardFooter>
                <Button disabled>Manage Users</Button>
            </CardFooter>
        </Card>
    );
}

function SystemSettings() {
     return (
        <Card>
            <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>Configure global application settings.</CardDescription>
            </CardHeader>
            <CardContent>
                 <p className="text-muted-foreground">System settings coming soon.</p>
                 {/* Add global settings like default currency, email config etc. */}
            </CardContent>
             <CardFooter>
                <Button disabled>Save System Settings</Button>
            </CardFooter>
        </Card>
    );
}


export default async function SettingsPage() {
  const superAdmin = await isSuperAdmin();
  const tenantId = await getTenantId(); // Might be null for super admin

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
         {superAdmin && <Badge variant="secondary"><ShieldCheck className="mr-1 h-4 w-4" />Super Admin</Badge>}
      </div>

        {superAdmin ? (
             <Tabs defaultValue="tenants" className="w-full">
                 <TabsList className="grid w-full grid-cols-3 md:w-[500px]">
                    <TabsTrigger value="tenants"><DatabaseZap className="mr-2 h-4 w-4 inline"/>Tenants</TabsTrigger>
                    <TabsTrigger value="globalUsers"><UserCog className="mr-2 h-4 w-4 inline"/>Global Users</TabsTrigger>
                    <TabsTrigger value="system"><Settings className="mr-2 h-4 w-4 inline"/>System</TabsTrigger>
                 </TabsList>
                 <TabsContent value="tenants" className="mt-4">
                      <TenantManagement />
                 </TabsContent>
                 <TabsContent value="globalUsers" className="mt-4">
                      <SuperAdminUserManagement />
                 </TabsContent>
                 <TabsContent value="system" className="mt-4">
                      <SystemSettings />
                 </TabsContent>
              </Tabs>
        ) : (
            <Tabs defaultValue="company" className="w-full">
              <TabsList className="grid w-full grid-cols-3 md:w-[400px]">
                <TabsTrigger value="company"><Building2 className="mr-2 h-4 w-4 inline"/>Company</TabsTrigger>
                <TabsTrigger value="users"><UserCog className="mr-2 h-4 w-4 inline"/>Users</TabsTrigger>
                <TabsTrigger value="taxes"><PercentSquare className="mr-2 h-4 w-4 inline"/>Taxes</TabsTrigger>
              </TabsList>
              <TabsContent value="company" className="mt-4">
                  <CompanySettings />
              </TabsContent>
              <TabsContent value="users" className="mt-4">
                  <TenantUserManagement />
              </TabsContent>
               <TabsContent value="taxes" className="mt-4">
                  <TenantTaxSettings />
              </TabsContent>
            </Tabs>
        )}


    </DashboardLayout>
  );
}

// Need to add Badge component if not already present
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import * as React from "react"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
// export { Badge, badgeVariants } // Keep export in ui/badge.tsx
