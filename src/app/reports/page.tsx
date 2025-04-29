
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react'; // Icon for download/generate
import Link from 'next/link';

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        {/* Add report filtering/generation options later */}
        {/* Example: Date range picker, report type selector */}
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
         <Card>
          <CardHeader>
            <CardTitle>Profit & Loss</CardTitle>
            <CardDescription>View income vs. expenses over a period.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-32">
             {/* Placeholder for Report Content or Generation Trigger */}
             <p className="text-sm text-muted-foreground mb-4">Generate Profit & Loss report.</p>
              <Button variant="outline" disabled>
                 <FileDown className="mr-2 h-4 w-4" /> Generate (Coming Soon)
             </Button>
          </CardContent>
        </Card>

        <Card>
           <CardHeader>
             <CardTitle>Balance Sheet</CardTitle>
             <CardDescription>Snapshot of assets, liabilities, and equity.</CardDescription>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center h-32">
             <p className="text-sm text-muted-foreground mb-4">Generate Balance Sheet report.</p>
             <Button variant="outline" disabled>
               <FileDown className="mr-2 h-4 w-4" /> Generate (Coming Soon)
             </Button>
           </CardContent>
         </Card>

          <Card>
           <CardHeader>
             <CardTitle>Accounts Receivable Aging</CardTitle>
             <CardDescription>Track outstanding invoices and their age.</CardDescription>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center h-32">
             <p className="text-sm text-muted-foreground mb-4">Generate A/R Aging report.</p>
             <Button variant="outline" disabled>
               <FileDown className="mr-2 h-4 w-4" /> Generate (Coming Soon)
             </Button>
           </CardContent>
         </Card>

         <Card>
           <CardHeader>
             <CardTitle>Accounts Payable Aging</CardTitle>
             <CardDescription>Track bills owed to vendors and their due dates.</CardDescription>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center h-32">
             <p className="text-sm text-muted-foreground mb-4">Generate A/P Aging report.</p>
             <Button variant="outline" disabled>
               <FileDown className="mr-2 h-4 w-4" /> Generate (Coming Soon)
             </Button>
           </CardContent>
         </Card>

         <Card>
           <CardHeader>
             <CardTitle>Expense by Category</CardTitle>
             <CardDescription>Summary of expenses broken down by category.</CardDescription>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center h-32">
             <p className="text-sm text-muted-foreground mb-4">Generate expense summary report.</p>
             <Button variant="outline" disabled>
               <FileDown className="mr-2 h-4 w-4" /> Generate (Coming Soon)
             </Button>
           </CardContent>
         </Card>

          <Card>
           <CardHeader>
             <CardTitle>Chart of Accounts List</CardTitle>
             <CardDescription>Export your full chart of accounts.</CardDescription>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center h-32">
             <p className="text-sm text-muted-foreground mb-4">Generate COA list.</p>
             {/* Could potentially link directly to a CSV export route */}
             <Button variant="outline" disabled>
               <FileDown className="mr-2 h-4 w-4" /> Export (Coming Soon)
             </Button>
           </CardContent>
         </Card>

        {/* Add more report cards as needed */}

      </div>
    </DashboardLayout>
  );
}
