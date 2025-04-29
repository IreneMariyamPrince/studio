import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCog, PercentSquare, Building2 } from 'lucide-react'; // Icons for tabs

// Placeholder components for different settings sections
function UserManagement() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage users and their roles.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">User management feature coming soon.</p>
                {/* Add user table, add user button, etc. here */}
            </CardContent>
             <CardFooter>
                <Button disabled>Add User</Button>
            </CardFooter>
        </Card>
    );
}

function TaxSettings() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Tax Rates</CardTitle>
                <CardDescription>Configure tax rates for invoices and expenses.</CardDescription>
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

function CompanySettings() {
     return (
        <Card>
            <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>Manage your company's details.</CardDescription>
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


export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

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
              <UserManagement />
          </TabsContent>
           <TabsContent value="taxes" className="mt-4">
              <TaxSettings />
          </TabsContent>
      </Tabs>

    </DashboardLayout>
  );
}
