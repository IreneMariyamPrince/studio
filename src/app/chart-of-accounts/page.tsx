
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { getAccounts } from '@/lib/actions/accounts';
import type { AccountSchema } from '@/lib/schemas/account';
import { AddAccountDialog } from './_components/add-account-dialog';
import { EditAccountDialog } from './_components/edit-account-dialog';
import { DeleteAccountDialog } from './_components/delete-account-dialog';
import 'server-only'; // Ensure this component runs only on the server for initial data fetching

export default async function ChartOfAccountsPage() {
  // Fetch accounts on the server during initial render
  const accounts: AccountSchema[] = await getAccounts();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        {/* AddAccountDialog manages its own state and triggers the server action */}
        <AddAccountDialog>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Account
          </Button>
        </AddAccountDialog>
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
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.code}</TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{account.type}</TableCell>
                  <TableCell>{account.description || '-'}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {/* EditAccountDialog takes the account data */}
                    <EditAccountDialog account={account}>
                       <Button variant="ghost" size="icon" className="h-8 w-8">
                         <Edit className="h-4 w-4" />
                         <span className="sr-only">Edit Account</span>
                       </Button>
                     </EditAccountDialog>
                    {/* DeleteAccountDialog takes account id and name */}
                     <DeleteAccountDialog accountId={account.id!} accountName={account.name}>
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                         <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete Account</span>
                       </Button>
                     </DeleteAccountDialog>
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No accounts found. Add a new account to get started.
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
