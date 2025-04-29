import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2, Filter } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';
import { getBudgets } from '@/lib/actions/budgets'; // Adjust path if needed
import type { BudgetSchema } from '@/lib/schemas/budget';
// Import Add/Edit/Delete dialogs when created
// import { AddBudgetDialog } from './_components/add-budget-dialog';
// import { EditBudgetDialog } from './_components/edit-budget-dialog';
// import { DeleteBudgetDialog } from './_components/delete-budget-dialog';
import 'server-only';

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Function to format period nicely (e.g., "2024-01" -> "Jan 2024", "2024" -> "Year 2024")
function formatPeriod(period: string): string {
    if (period.includes('-')) {
        const [year, month] = period.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else {
        return `Year ${period}`;
    }
}

export default async function BudgetsPage() {
  const budgets: any[] = await getBudgets(); // Use any for now, refine with included data type

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <div className="flex gap-2">
            {/* Add Filters e.g., by year, by account type */}
            <Button variant="outline" disabled>
                <Filter className="mr-2 h-4 w-4" /> Filter (Not Implemented)
            </Button>
           {/* <AddBudgetDialog> */}
             <Button>
               <PlusCircle className="mr-2 h-4 w-4" /> Add New Budget (Not Implemented)
             </Button>
           {/* </AddBudgetDialog> */}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget Overview</CardTitle>
          <CardDescription>Set and track budgets for your accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>List of configured budgets.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Budgeted Amount</TableHead>
                <TableHead className="text-right">Actual Amount</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((budget) => {
                 const actualAmount = 0; // Placeholder: Fetch actual amount for the period/account
                 const variance = budget.amount - actualAmount;
                 const variancePercent = budget.amount !== 0 ? (variance / budget.amount) * 100 : 0;

                 return (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">{budget.account?.name || budget.accountId}</TableCell> {/* Display name if included */}
                      <TableCell>{formatPeriod(budget.period)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(budget.amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(actualAmount)}</TableCell>
                      <TableCell className={`text-right ${variance < 0 ? 'text-destructive' : 'text-green-600'}`}>
                           {formatCurrency(variance)} ({variancePercent.toFixed(1)}%)
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {/* <EditBudgetDialog budget={budget}> */}
                           <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit Budget</span>
                           </Button>
                         {/* </EditBudgetDialog> */}
                        {/* <DeleteBudgetDialog budgetId={budget.id!} budgetPeriod={budget.period} accountName={budget.account?.name}> */}
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled>
                             <Trash2 className="h-4 w-4" />
                             <span className="sr-only">Delete Budget</span>
                           </Button>
                         {/* </DeleteBudgetDialog> */}
                      </TableCell>
                    </TableRow>
                 )
            })}
              {budgets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No budgets set yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
