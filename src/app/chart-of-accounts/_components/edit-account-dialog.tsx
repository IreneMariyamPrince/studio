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
import { AccountForm } from './account-form'; // Use local form component
import { updateAccount } from '@/lib/actions/accounts';
import type { AccountSchema, AccountFormSchema } from '@/lib/schemas/account'; // Import both schemas
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountFormSchema } from '@/lib/schemas/account'; // Import the form schema

interface EditAccountDialogProps {
  children: ReactNode; // Trigger element (e.g., Edit button)
  account: AccountSchema; // Pass the full AccountSchema for initial data
}

export function EditAccountDialog({ children, account }: EditAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Prepare default values for the form schema from the full account schema
   const defaultFormValues: AccountFormSchema = {
       code: account.code,
       name: account.name,
       type: account.type,
       description: account.description ?? '', // Ensure string or empty string
       isActive: account.isActive ?? true,
   };

  // Initialize react-hook-form with the form schema and prepared defaults
  const form = useForm<AccountFormSchema>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: defaultFormValues,
  });

  // Reset form when dialog opens or account data changes externally
  useEffect(() => {
      if (isOpen) {
          // Re-calculate defaults in case account prop changed
          const currentDefaultValues: AccountFormSchema = {
               code: account.code,
               name: account.name,
               type: account.type,
               description: account.description ?? '',
               isActive: account.isActive ?? true,
           };
          form.reset(currentDefaultValues);
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, account]); // form.reset removed from dependencies


  const onSubmit = (data: AccountFormSchema) => {
     form.clearErrors();
     const formData = new FormData();
     formData.append('id', account.id!); // Add the ID for the update action

     Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'boolean') {
         formData.append(key, value ? 'true' : 'false');
       } else if (value !== undefined && value !== null && value !== '') { // Append non-empty strings/numbers
         formData.append(key, String(value));
       }
     });

    startTransition(async () => {
      const result = await updateAccount(formData);
      if (result.success) {
        setIsOpen(false);
        toast({
          title: "Success",
          description: result.message,
        });
      } else {
         toast({
          title: "Error Updating Account",
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
         console.error("Error updating account:", result.error, result.fieldErrors);
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
     setIsOpen(open);
     // Resetting is handled by useEffect based on `isOpen` state
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
          form={form}
          onSubmit={onSubmit}
          isPending={isPending}
          onCancel={() => handleOpenChange(false)}
          submitButtonText="Save Changes"
        />
      </DialogContent>
    </Dialog>
  );
}
