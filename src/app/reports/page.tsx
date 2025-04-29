import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        {/* Add report filtering/generation options later */}
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
         <Card>
          <CardHeader>
            <CardTitle>Account Balances</CardTitle>
            <CardDescription>View balances for different accounts.</CardDescription>
          </CardHeader>
          <CardContent>
             {/* Placeholder for Account Balances Report */}
             <p className="text-sm text-muted-foreground">Account balances report will be displayed here.</p>
             {/* Add logic to fetch and display report */}
          </CardContent>
        </Card>

         <Card>
          <CardHeader>
            <CardTitle>Expense Summary</CardTitle>
            <CardDescription>Summary of expenses by category or period.</CardDescription>
          </CardHeader>
          <CardContent>
             {/* Placeholder for Expense Summary Report */}
             <p className="text-sm text-muted-foreground">Expense summary report will be displayed here.</p>
             {/* Add logic to fetch and display report */}
          </CardContent>
        </Card>

         <Card>
          <CardHeader>
            <CardTitle>Invoice Aging</CardTitle>
            <CardDescription>Track outstanding invoices and their age.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Placeholder for Invoice Aging Report */}
             <p className="text-sm text-muted-foreground">Invoice aging report will be displayed here.</p>
             {/* Add logic to fetch and display report */}
          </CardContent>
        </Card>

        {/* Add more report cards as needed */}

      </div>
    </DashboardLayout>
  );
}
