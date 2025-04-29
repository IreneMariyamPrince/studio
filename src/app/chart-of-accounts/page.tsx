'use client';

import { useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AccountForm } from '@/components/chart-of-accounts/account-form';
import type { AccountSchema } from '@/lib/schemas/account';
import { useToast } from "@/hooks/use-toast";

// Mock data (replace with actual data fetching and state management)
const initialAccounts: AccountSchema[] = [
  { id: '1', code: '1010', name: 'Cash', type: 'Asset', description: 'Main operating bank account' },
  { id: '2', code: '1200', name: 'Accounts Receivable', type: 'Asset', description: 'Money owed by customers' },
  { id: '3', code: '2010', name: 'Accounts Payable', type: 'Liability', description: 'Money owed to suppliers' },
  { id: '4', code: '4010', name: 'Sales Revenue', type: 'Revenue', description: 'Income from primary business activities' },
  { id: '5', code: '5010', name: 'Office Supplies Expense', type: 'Expense', description: 'Cost of office supplies' },
  { id: '6', code: '5020', name: 'Rent Expense', type: 'Expense', description: 'Monthly rent payments' },
];

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<AccountSchema[]>(initialAccounts);
  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = useState(false);
  const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<AccountSchema | null>(null);
  const { toast } = useToast();

  const handleAddAccount = (data: AccountSchema) => {
    // In a real app, this would be an API call. Using simple state update for now.
    const newAccount = { ...data, id: (Math.random() * 10000).toString() }; // Simple ID generation
    setAccounts([...accounts, newAccount]);
    setIsAddAccountDialogOpen(false);
    toast({
      title: "Account Added",
      description: `Account "${data.name}" has been successfully added.`,
    });
  };

  const handleEditAccount = (data: AccountSchema) => {
    if (!accountToEdit) return;
    // In a real app, this would be an API call.
    setAccounts(accounts.map(acc => acc.id === accountToEdit.id ? { ...data, id: accountToEdit.id } : acc));
    setIsEditAccountDialogOpen(false);
    setAccountToEdit(null);
     toast({
      title: "Account Updated",
      description: `Account "${data.name}" has been successfully updated.`,
    });
  };

  const handleDeleteAccount = (accountId: string) => {
    // In a real app, this would be an API call.
    const accountToDelete = accounts.find(acc => acc.id === accountId);
    setAccounts(accounts.filter(acc => acc.id !== accountId));
     toast({
      title: "Account Deleted",
      description: `Account "${accountToDelete?.name}" has been deleted.`,
      variant: "destructive" // Optional: use destructive style
    });
  };

  const openEditDialog = (account: AccountSchema) => {
    setAccountToEdit(account);
    setIsEditAccountDialogOpen(true);
  };

  return (
    <DashboardLayout>
       <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        <Dialog open={isAddAccountDialogOpen} onOpenChange={setIsAddAccountDialogOpen}>
            <DialogTrigger asChild>
                <Button>
                 <PlusCircle className="mr-2 h-4 w-4" /> Add New Account
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                <DialogTitle>Add New Account</DialogTitle>
                <DialogDescription>
                    Enter the details for the new financial account.
                </DialogDescription>
                </DialogHeader>
                 <AccountForm
                    onSubmit={handleAddAccount}
                    onCancel={() => setIsAddAccountDialogOpen(false)}
                 />
             </DialogContent>
         </Dialog>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(account)}>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit Account</span>
                      </Button>
                       <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete Account</span>
                            </Button>
                         </AlertDialogTrigger>
                         <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the
                                account "{account.name}".
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteAccount(account.id!)}>
                                Delete
                             </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                       </AlertDialog>
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

       {/* Edit Account Dialog */}
       <Dialog open={isEditAccountDialogOpen} onOpenChange={setIsEditAccountDialogOpen}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                <DialogTitle>Edit Account</DialogTitle>
                <DialogDescription>
                    Update the details for the account "{accountToEdit?.name}".
                </DialogDescription>
                </DialogHeader>
                 {accountToEdit && (
                   <AccountForm
                      onSubmit={handleEditAccount}
                      onCancel={() => {
                          setIsEditAccountDialogOpen(false);
                          setAccountToEdit(null);
                      }}
                      defaultValues={accountToEdit}
                   />
                 )}
             </DialogContent>
         </Dialog>
    </DashboardLayout>
  );
}
