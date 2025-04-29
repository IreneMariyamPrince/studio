import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
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

// Mock data - replace with actual data fetching
const accounts = [
  { code: '1010', name: 'Cash', type: 'Asset', description: 'Main operating bank account' },
  { code: '1200', name: 'Accounts Receivable', type: 'Asset', description: 'Money owed by customers' },
  { code: '2010', name: 'Accounts Payable', type: 'Liability', description: 'Money owed to suppliers' },
  { code: '4010', name: 'Sales Revenue', type: 'Revenue', description: 'Income from primary business activities' },
  { code: '5010', name: 'Office Supplies Expense', type: 'Expense', description: 'Cost of office supplies' },
  { code: '5020', name: 'Rent Expense', type: 'Expense', description: 'Monthly rent payments' },
];

export default function ChartOfAccountsPage() {
  return (
    <DashboardLayout>
       <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
         {/* Optional: Button to add new account */}
        {/* <Button asChild>
          <Link href="/chart-of-accounts/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Account
          </Link>
        </Button> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts List</CardTitle>
          <CardDescription>Manage the financial accounts used for categorization.</CardDescription>
        </CardHeader>
        <CardContent>
           <Table>
            <TableCaption>List of financial accounts.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                 <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.code}>
                  <TableCell className="font-medium">{account.code}</TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{account.type}</TableCell>
                   <TableCell>{account.description}</TableCell>
                  <TableCell className="text-right">
                     <Button variant="ghost" size="sm">Edit</Button> {/* Add edit/delete later */}
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No accounts found.
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
