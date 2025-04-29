
'use client';

import type { ReactNode } from 'react';
import { useState, useTransition, useEffect } from 'react';
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
import { useForm } from 'react-hook-form'; // Import useForm
import { zodResolver } from '@hookform/resolvers/zod'; // Import zodResolver
import { accountSchema } from '@/lib/schemas/account'; // Import the schema itself

interface EditAccountDialogProps {
  children: ReactNode; // Trigger element (e.g., Edit button)
  account: AccountSchema;
}

export function EditAccountDialog({ children, account }: EditAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Initialize react-hook-form for the edit form
  const form = useForm<AccountSchema>({
    resolver: zodResolver(accountSchema), // Use the full schema including id for validation context
    defaultValues: account, // Pre-fill with existing account data
  });

  // Reset form when dialog opens or closes, or when account data changes externally
  useEffect(() => {
      if (isOpen) {
          form.reset(account); // Reset form with current account data when dialog opens
      }
  }, [isOpen, account, form]);


  const onSubmit = (data: AccountSchema) => {
     form.clearErrors(); // Clear previous errors
     const formData = new FormData();
     // Ensure the account ID is included
     formData.append('id', account.id!); // Use the original account ID

     Object.entries(data).forEach(([key, value]) => {
        // Append other fields, ensure id isn't duplicated if present in `data`
        if (key !== 'id' && value !== undefined && value !== null) {
            formData.append(key, String(value));
        }
     });

    startTransition(async () => {
      const result = await updateAccount(formData);
      if (result.success) {
        setIsOpen(false);
        // No need to reset form here, useEffect handles it on close/reopen
        toast({
          title: "Success",
          description: result.message,
        });
        // Revalidation handled by server action
      } else {
         toast({
          title: "Error Updating Account",
          description: result.message || "An unexpected error occurred.",
          variant: "destructive",
        });
        // Set form errors if fieldErrors object is returned
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([fieldName, errors]) => {
            if (errors && errors.length > 0) {
              form.setError(fieldName as keyof AccountSchema, {
                type: 'server',
                message: errors[0],
              });
            }
          });
        }
         console.error("Error updating account:", result.error, result.fieldErrors);
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
     // Resetting is now handled by useEffect based on `isOpen` state
     setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>
            Update the details for the account "{account.name}".
          </DialogDescription>
        </DialogHeader>
        <AccountForm
          form={form} // Pass the form instance
          onSubmit={onSubmit} // Pass the onSubmit handler
          isPending={isPending}
          onCancel={() => handleOpenChange(false)} // Use handler for consistent close logic
          // Default values are set in useForm initialization and useEffect
          submitButtonText="Save Changes"
        />
      </DialogContent>
    </Dialog>
  );
}
