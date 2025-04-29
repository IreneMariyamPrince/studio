
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Eye, Edit, Trash2 } from 'lucide-react'; // Add required icons
import {
  Table,
  TableHeader,
  TableBody,
  // TableFooter, // Removed for now
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';
import { getExpenses } from '@/lib/actions/expenses'; // Import server action
import { format } from 'date-fns'; // For date formatting
import { Badge } from '@/components/ui/badge'; // For status display
import 'server-only'; // Ensure data fetching on server
// import { DeleteExpenseDialog } from './_components/delete-expense-dialog'; // Future component

function formatCurrency(amount: number): string {
   return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Map status to badge variants (optional)
const statusVariantMap: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
    Approved: "default", // Or 'success' if you add a green variant
    Pending: "secondary",
    Rejected: "destructive",
};

export default async function ExpensesPage() {
  // Fetch expenses on the server
  const expenses = await getExpenses();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Expenses</h1>
        <Button asChild>
          <Link href="/expenses/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Expense
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense List</CardTitle>
          <CardDescription>View and manage all company expenses.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of your company's recent expenses.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{format(new Date(expense.date), 'PP')}</TableCell> {/* Format date */}
                  <TableCell>{expense.account.name}</TableCell> {/* Use included account name */}
                   <TableCell className="max-w-[200px] truncate" title={expense.description}>
                      {expense.description || '-'}
                   </TableCell>
                  <TableCell>
                     <Badge variant={statusVariantMap[expense.status] || 'outline'}>
                         {expense.status}
                     </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                   <TableCell className="text-right space-x-1">
                       {/* Link to view/edit page (create later) */}
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <Link href={`/expenses/${expense.id}/edit`} title="Edit Expense">
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Link>
                        </Button>
                       {/* Placeholder for Delete */}
                       {/* <DeleteExpenseDialog expenseId={expense.id!} expenseDescription={expense.description || `Expense on ${format(new Date(expense.date), 'PP')}`}>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete Expense">
                             <Trash2 className="h-4 w-4" />
                             <span className="sr-only">Delete</span>
                           </Button>
                       </DeleteExpenseDialog> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete Expense (Not Implemented)">
                         <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete</span>
                       </Button>
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No expenses found. <Link href="/expenses/new" className="text-primary underline">Add one now</Link>.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {/* Optional Footer - calculate total if needed */}
            {/* <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total Approved</TableCell>
                <TableCell className="text-right">$2,500.00</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter> */}
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
