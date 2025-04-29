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
import { AccountForm } from './account-form'; // Use local form component
import { addAccount } from '@/lib/actions/accounts';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import type { AccountFormSchema } from '@/lib/schemas/account'; // Import AccountFormSchema type
import { zodResolver } from '@hookform/resolvers/zod';
import { accountFormSchema } from '@/lib/schemas/account'; // Import the form schema itself

interface AddAccountDialogProps {
  children: ReactNode; // Trigger element
}

export function AddAccountDialog({ children }: AddAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Initialize react-hook-form with the form schema
  const form = useForm<AccountFormSchema>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      code: '',
      name: '',
      type: undefined,
      description: '',
      isActive: true, // Default to active
    },
  });

  const onSubmit = (data: AccountFormSchema) => {
    form.clearErrors();
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
       // Handle boolean specifically for FormData
       if (typeof value === 'boolean') {
         formData.append(key, value ? 'true' : 'false');
       } else if (value !== undefined && value !== null && value !== '') { // Append non-empty strings/numbers
         formData.append(key, String(value));
       }
     });


    startTransition(async () => {
      const result = await addAccount(formData);
      if (result.success) {
        setIsOpen(false);
        form.reset(); // Reset form fields on success
        toast({
          title: "Success",
          description: result.message,
        });
      } else {
        toast({
          title: "Error Adding Account",
          description: result.message || "An unexpected error occurred.",
          variant: "destructive",
        });
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([fieldName, errors]) => {
            if (errors && errors.length > 0) {
              form.setError(fieldName as keyof AccountFormSchema, {
                type: 'server',
                message: errors[0],
              });
            }
          });
        }
         console.error("Error adding account:", result.error, result.fieldErrors);
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
     if (!open) {
         form.reset();
     }
     setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add New Account</DialogTitle>
          <DialogDescription>
            Enter the details for the new financial account.
          </DialogDescription>
        </DialogHeader>
        <AccountForm
          form={form}
          onSubmit={onSubmit}
          isPending={isPending}
          onCancel={() => handleOpenChange(false)}
          submitButtonText="Create Account"
        />
      </DialogContent>
    </Dialog>
  );
}
