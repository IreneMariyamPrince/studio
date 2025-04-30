

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getDashboardStats, getRecentExpenses, getRecentInvoices } from '@/lib/actions/dashboard';
import 'server-only'; // Ensure data fetching happens on the server
import { format } from 'date-fns'; // For formatting dates
import { Badge } from '@/components/ui/badge'; // For status display
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // For recent lists

function formatCurrency(amount: number): string {
   return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function DashboardPage() {
   // Fetch data on the server
   const stats = await getDashboardStats();
   const recentExpenses = await getRecentExpenses(5); // Fetch recent 5 expenses
   const recentInvoices = await getRecentInvoices(5); // Fetch recent 5 invoices

  return (
    <DashboardLayout>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Expenses (This Month)
            </CardTitle>
            <span className="text-muted-foreground">$</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalExpensesThisMonth)}</div>
            <p className={`text-xs ${stats.expenseChangePercent === null || stats.expenseChangePercent >= 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
              {stats.expenseChangePercent !== null
                 ? `${stats.expenseChangePercent >= 0 ? '+' : ''}${stats.expenseChangePercent.toFixed(1)}% from last month`
                 : 'No change data'}

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
            <div className="text-2xl font-bold">{stats.pendingInvoicesCount}</div>
            <p className="text-xs text-muted-foreground">
              Totaling {formatCurrency(stats.pendingInvoicesAmount)}
            </p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Expense Reports</CardTitle>
             <span className="text-muted-foreground">#</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.openExpenseReportsCount}</div>
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
            <div className="text-2xl font-bold">{stats.activeAccountsCount}</div>
             <p className="text-xs text-muted-foreground">
              In Chart of Accounts
            </p>
          </CardContent>
        </Card>
      </div>

       <div className="mt-6 grid gap-6 md:grid-cols-2">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between">
             <div>
               <CardTitle>Recent Expenses</CardTitle>
               <CardDescription>Overview of the latest recorded expenses.</CardDescription>
             </div>
             <Button asChild size="sm" variant="outline">
                <Link href="/expenses">View All</Link>
             </Button>
           </CardHeader>
           <CardContent>
            {recentExpenses.length > 0 ? (
              <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Date</TableHead>
                     <TableHead>Category</TableHead>
                     <TableHead className="text-right">Amount</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {recentExpenses.map(exp => (
                     <TableRow key={exp.id}>
                       {/* Ensure date is a valid Date object before formatting */}
                       <TableCell>{format(new Date(exp.date), 'PP')}</TableCell>
                       <TableCell>{exp.account?.name ?? 'N/A'}</TableCell>
                       <TableCell className="text-right">{formatCurrency(exp.amount)}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
              </Table>
            ) : (
               <p className="text-sm text-muted-foreground text-center py-4">No recent expenses recorded yet.</p>
            )}
           </CardContent>
         </Card>

          <Card>
           <CardHeader className="flex flex-row items-center justify-between">
             <div>
               <CardTitle>Recent Invoices</CardTitle>
               <CardDescription>Overview of the latest generated invoices.</CardDescription>
             </div>
             <Button asChild size="sm" variant="outline">
                <Link href="/invoices">View All</Link>
             </Button>
           </CardHeader>
           <CardContent>
            {recentInvoices.length > 0 ? (
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Invoice #</TableHead>
                     <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                     <TableHead className="text-right">Amount</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {recentInvoices.map(inv => (
                     <TableRow key={inv.id}>
                       <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                       <TableCell>{inv.client?.name ?? 'N/A'}</TableCell>
                       <TableCell><Badge variant={inv.status === 'Paid' ? 'success' : inv.status === 'Pending' || inv.status === 'Partial' ? 'secondary' : 'outline'}>{inv.status}</Badge></TableCell>
                       <TableCell className="text-right">{formatCurrency(inv.total!)}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
            ) : (
               <p className="text-sm text-muted-foreground text-center py-4">No recent invoices generated yet.</p>
            )}
              <Button asChild size="sm" className="mt-4 float-right">
                 <Link href="/invoices/new">Create New Invoice</Link>
              </Button>
           </CardContent>
         </Card>
       </div>

       {/* Placeholder for charts - Implement using shadcn/charts and fetch relevant data */}
       {/*
       <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Expense Trends (Chart Placeholder)</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
               <p className="text-sm text-muted-foreground">Chart component would go here.</p>
               Example: <ExpenseChart data={chartData} />
            </CardContent>
          </Card>
       </div>
       */}

    </DashboardLayout>
  );
}
