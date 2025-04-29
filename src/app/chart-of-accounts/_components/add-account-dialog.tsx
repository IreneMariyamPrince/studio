
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
import { useForm } from 'react-hook-form'; // Import useForm for managing form state, including errors
import type { AccountSchema } from '@/lib/schemas/account'; // Import AccountSchema type
import { zodResolver } from '@hookform/resolvers/zod'; // Import zodResolver
import { accountSchema } from '@/lib/schemas/account'; // Import the schema itself

interface AddAccountDialogProps {
  children: ReactNode; // Trigger element
}

export function AddAccountDialog({ children }: AddAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Initialize react-hook-form
  const form = useForm<AccountSchema>({
    resolver: zodResolver(accountSchema.omit({ id: true })), // Use schema for validation
    defaultValues: {
      code: '',
      name: '',
      type: undefined,
      description: '',
    },
  });

  // Function to handle form submission via the server action
  const onSubmit = (data: AccountSchema) => {
    form.clearErrors(); // Clear previous errors
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
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
        // Revalidation is handled by the server action
      } else {
        // Display general error message
        toast({
          title: "Error Adding Account",
          description: result.message || "An unexpected error occurred.",
          variant: "destructive",
        });
        // Set form errors if fieldErrors object is returned
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([fieldName, errors]) => {
            if (errors && errors.length > 0) {
              form.setError(fieldName as keyof AccountSchema, {
                type: 'server',
                message: errors[0], // Display the first error message for the field
              });
            }
          });
        }
         console.error("Error adding account:", result.error, result.fieldErrors);
      }
    });
  };

  // Reset form when dialog is closed or opened
  const handleOpenChange = (open: boolean) => {
     if (!open) {
         form.reset(); // Reset form when closing
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
        {/* Pass form context and onSubmit handler to AccountForm */}
        <AccountForm
          form={form} // Pass the form instance
          onSubmit={onSubmit} // Pass the onSubmit handler
          isPending={isPending}
          onCancel={() => handleOpenChange(false)} // Use handler to reset form
          submitButtonText="Create Account"
        />
      </DialogContent>
    </Dialog>
  );
}
