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
import { ClientForm } from './client-form'; // Use local form component
import { addClient } from '@/lib/actions/clients';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import type { ClientFormSchema } from '@/lib/schemas/client'; // Import ClientFormSchema type
import { zodResolver } from '@hookform/resolvers/zod';
import { clientFormSchema } from '@/lib/schemas/client'; // Import the form schema itself

interface AddClientDialogProps {
  children: ReactNode; // Trigger element
}

export function AddClientDialog({ children }: AddClientDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Initialize react-hook-form with the form schema
  const form = useForm<ClientFormSchema>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      paymentTerms: '',
    },
  });

  const onSubmit = (data: ClientFormSchema) => {
    form.clearErrors();
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
       if (value !== undefined && value !== null && value !== '') { // Append non-empty strings/numbers
         formData.append(key, String(value));
       }
     });


    startTransition(async () => {
      const result = await addClient(formData);
      if (result.success) {
        setIsOpen(false);
        form.reset(); // Reset form fields on success
        toast({
          title: "Success",
          description: result.message,
        });
      } else {
        toast({
          title: "Error Adding Client",
          description: result.message || "An unexpected error occurred.",
          variant: "destructive",
        });
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([fieldName, errors]) => {
            if (errors && errors.length > 0) {
              form.setError(fieldName as keyof ClientFormSchema, {
                type: 'server',
                message: errors[0],
              });
            }
          });
        }
         console.error("Error adding client:", result.error, result.fieldErrors);
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
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Enter the details for the new client.
          </DialogDescription>
        </DialogHeader>
        <ClientForm
          form={form}
          onSubmit={onSubmit}
          isPending={isPending}
          onCancel={() => handleOpenChange(false)}
          submitButtonText="Create Client"
        />
      </DialogContent>
    </Dialog>
  );
}

