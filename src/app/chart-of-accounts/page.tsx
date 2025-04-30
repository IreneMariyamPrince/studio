
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; // Import Badge
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
import { EditAccountDialog, type SerializableAccountData } from './_components/edit-account-dialog';
import { DeleteAccountDialog } from './_components/delete-account-dialog';
import 'server-only';

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function ChartOfAccountsPage() {
  const accounts: AccountSchema[] = await getAccounts();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
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
                 <TableHead>Status</TableHead> {/* Added Status */}
                 <TableHead className="text-right">Balance</TableHead> {/* Added Balance */}
                <TableHead className="text-right w-[120px]">Actions</TableHead> {/* Adjusted width */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                 // Prepare serializable data to pass to the client component
                 const serializableAccount: SerializableAccountData = {
                     id: account.id!, // Ensure ID is a string
                     code: account.code,
                     name: account.name,
                     type: account.type,
                     description: account.description,
                     balance: account.balance,
                     isActive: account.isActive,
                     // Convert dates to ISO strings
                     createdAt: account.createdAt?.toISOString(),
                     updatedAt: account.updatedAt?.toISOString(),
                 };

                return (
                    <TableRow key={serializableAccount.id}>
                      <TableCell className="font-medium">{serializableAccount.code}</TableCell>
                      <TableCell>{serializableAccount.name}</TableCell>
                      <TableCell>{serializableAccount.type}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={serializableAccount.description}>{serializableAccount.description || '-'}</TableCell>
                       <TableCell>
                         <Badge variant={serializableAccount.isActive ? 'default' : 'outline'}>
                             {serializableAccount.isActive ? 'Active' : 'Inactive'}
                         </Badge>
                       </TableCell>
                       <TableCell className="text-right">
                         {/* Show balance only for relevant account types */}
                         {['Asset', 'Liability', 'Equity'].includes(serializableAccount.type)
                           ? formatCurrency(serializableAccount.balance)
                           : '-'}
                       </TableCell>
                      <TableCell className="text-right space-x-1">
                        {/* Pass the serializable data to the client component */}
                        <EditAccountDialog account={serializableAccount}>
                           <Button variant="ghost" size="icon" className="h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit Account</span>
                           </Button>
                         </EditAccountDialog>
                         <DeleteAccountDialog accountId={serializableAccount.id!} accountName={serializableAccount.name}>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                             <Trash2 className="h-4 w-4" />
                             <span className="sr-only">Delete Account</span>
                           </Button>
                         </DeleteAccountDialog>
                      </TableCell>
                    </TableRow>
                );
            })}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center"> {/* Increased colspan */}
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

