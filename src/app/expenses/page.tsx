import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';

// Mock data - replace with actual data fetching
const expenses = [
  { id: 'EXP001', date: '2024-05-15', category: 'Office Supplies', amount: 75.50, status: 'Approved' },
  { id: 'EXP002', date: '2024-05-14', category: 'Travel', amount: 320.00, status: 'Pending' },
  { id: 'EXP003', date: '2024-05-12', category: 'Software Subscription', amount: 49.99, status: 'Approved' },
  { id: 'EXP004', date: '2024-05-10', category: 'Meals & Entertainment', amount: 150.25, status: 'Rejected' },
];

export default function ExpensesPage() {
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
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                 <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">{expense.id}</TableCell>
                  <TableCell>{expense.date}</TableCell>
                  <TableCell>{expense.category}</TableCell>
                   <TableCell>{expense.status}</TableCell>
                  <TableCell className="text-right">${expense.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                     <Button variant="ghost" size="sm">View</Button> {/* Add edit/delete later */}
                  </TableCell>
                </TableRow>
              ))}
               {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No expenses found.
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
            {/* Optional Footer */}
             {/* <TableFooter>
               <TableRow>
                 <TableCell colSpan={4}>Total</TableCell>
                 <TableCell className="text-right">$2,500.00</TableCell>
               </TableRow>
             </TableFooter> */}
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
