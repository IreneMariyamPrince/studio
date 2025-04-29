
'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AccountForm } from '@/components/chart-of-accounts/account-form';
import { updateAccount } from '@/lib/actions/accounts';
import type { AccountSchema } from '@/lib/schemas/account';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button'; // Import Button for DialogFooter

interface EditAccountDialogProps {
  children: ReactNode; // Trigger element (e.g., Edit button)
  account: AccountSchema;
}

export function EditAccountDialog({ children, account }: EditAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleSubmit = (formData: FormData) => {
     // Ensure the account ID is included in the form data for the action
     formData.set('id', account.id!);

    startTransition(async () => {
      const result = await updateAccount(formData);
      if (result.success) {
        setIsOpen(false);
        toast({
          title: "Success",
          description: result.message,
        });
        // Revalidation handled by server action
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to update account.",
          variant: "destructive",
        });
         console.error("Error updating account:", result.error);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>
            Update the details for the account "{account.name}".
          </DialogDescription>
        </DialogHeader>
        <AccountForm
          action={handleSubmit}
          isPending={isPending}
          onCancel={() => setIsOpen(false)}
          defaultValues={account}
          submitButtonText="Save Changes"
        />
      </DialogContent>
    </Dialog>
  );
}
