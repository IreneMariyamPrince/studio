
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
import { addAccount } from '@/lib/actions/accounts';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button'; // Import Button for DialogFooter

interface AddAccountDialogProps {
  children: ReactNode; // Trigger element
}

export function AddAccountDialog({ children }: AddAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await addAccount(formData);
      if (result.success) {
        setIsOpen(false);
        toast({
          title: "Success",
          description: result.message,
        });
        // Revalidation is handled by the server action
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to add account.",
          variant: "destructive",
        });
         console.error("Error adding account:", result.error);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add New Account</DialogTitle>
          <DialogDescription>
            Enter the details for the new financial account.
          </DialogDescription>
        </DialogHeader>
        {/* AccountForm now uses the action directly */}
        <AccountForm
          action={handleSubmit}
          isPending={isPending}
          onCancel={() => setIsOpen(false)}
          submitButtonText="Create Account"
        />
      </DialogContent>
    </Dialog>
  );
}
