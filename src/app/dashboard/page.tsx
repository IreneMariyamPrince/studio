import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Expenses
            </CardTitle>
            <span className="text-muted-foreground">$</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$45,231.89</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Invoices
            </CardTitle>
             <span className="text-muted-foreground">#</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              +5 since last week
            </p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Expense Reports</CardTitle>
             <span className="text-muted-foreground">#</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
             <span className="text-muted-foreground">#</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">23</div>
             <p className="text-xs text-muted-foreground">
              In Chart of Accounts
            </p>
          </CardContent>
        </Card>
      </div>

       <div className="mt-6 grid gap-6 md:grid-cols-2">
         <Card>
          <CardHeader>
            <CardTitle>Recent Expenses</CardTitle>
             <CardDescription>Overview of the latest recorded expenses.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Placeholder for recent expenses list */}
            <p className="text-sm text-muted-foreground">No recent expenses recorded yet.</p>
             <Button asChild size="sm" className="mt-4">
                <Link href="/expenses">View All Expenses</Link>
             </Button>
          </CardContent>
        </Card>
         <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
             <CardDescription>Overview of the latest generated invoices.</CardDescription>
          </CardHeader>
          <CardContent>
             {/* Placeholder for recent invoices list */}
             <p className="text-sm text-muted-foreground">No recent invoices generated yet.</p>
              <Button asChild size="sm" className="mt-4">
                 <Link href="/invoices/new">Create New Invoice</Link>
              </Button>
          </CardContent>
        </Card>
       </div>

       {/* Placeholder for charts */}
       {/* <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Expense Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Expense chart placeholder.</p>
            </CardContent>
          </Card>
       </div> */}

    </DashboardLayout>
  );
}
