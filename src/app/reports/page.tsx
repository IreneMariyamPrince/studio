import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, AreaChart, BarChartBig, Scale, Clock } from 'lucide-react'; // Added more icons
import Link from 'next/link';

// Placeholder for report generation components/logic
function ReportPlaceholder({ title, description, comingSoon = true }: { title: string, description: string, comingSoon?: boolean }) {
    return (
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-32">
             {comingSoon ? (
                 <>
                    <p className="text-sm text-muted-foreground mb-4">Report generation coming soon.</p>
                    <Button variant="outline" disabled>
                       <FileDown className="mr-2 h-4 w-4" /> Generate (Coming Soon)
                    </Button>
                 </>
             ) : (
                  <Button variant="outline">
                     <FileDown className="mr-2 h-4 w-4" /> Generate / View
                 </Button>
                 // Add date pickers or other filters here
             )}
          </CardContent>
        </Card>
    );
}


export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        {/* Add global report filters like date range */}
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">

         <ReportPlaceholder
            title="Profit & Loss"
            description="View income vs. expenses over a period."
         />

         <ReportPlaceholder
            title="Balance Sheet"
            description="Snapshot of assets, liabilities, and equity."
          />

          <ReportPlaceholder
            title="Cash Flow Statement"
            description="Track the movement of cash in and out."
          />

         <ReportPlaceholder
            title="Accounts Receivable Aging"
            description="Track outstanding invoices and their age."
          />

         <ReportPlaceholder
            title="Accounts Payable Aging"
            description="Track bills owed to vendors and their due dates."
          />

         <ReportPlaceholder
            title="Expense by Category"
            description="Summary of expenses broken down by category."
          />

          <ReportPlaceholder
            title="Budget vs. Actuals"
            description="Compare budgeted amounts against actual spending."
            />

         {/* Keep Chart of Accounts List Export */}
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

         {/* Add Audit Trail Report */}
         <Card>
           <CardHeader>
             <CardTitle>Audit Trail</CardTitle>
             <CardDescription>View a log of all user actions.</CardDescription>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center h-32">
             <p className="text-sm text-muted-foreground mb-4">View detailed audit log.</p>
             <Button variant="outline" disabled>
               <Clock className="mr-2 h-4 w-4" /> View Log (Coming Soon)
             </Button>
           </CardContent>
         </Card>

        {/* Add more report cards as needed */}

      </div>
    </DashboardLayout>
  );
}
