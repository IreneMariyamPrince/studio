
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
import { ClientForm } from './client-form'; // Use local form component
import { updateClient } from '@/lib/actions/clients';
import type { ClientSchema, ClientFormSchema } from '@/lib/schemas/client'; // Import both schemas
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clientFormSchema } from '@/lib/schemas/client'; // Import the form schema

// Define a type for the serializable client data passed from the server
export type SerializableClientData = Omit<ClientSchema, 'createdAt' | 'updatedAt'> & {
    id: string; // Ensure ID is string
    createdAt?: string; // Date as string
    updatedAt?: string; // Date as string
};


interface EditClientDialogProps {
  children: ReactNode; // Trigger element (e.g., Edit button)
  client: SerializableClientData; // Use the serializable type
}

export function EditClientDialog({ children, client }: EditClientDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Prepare default values for the form schema from the serializable client schema
   const defaultFormValues: ClientFormSchema = {
       name: client.name,
       email: client.email ?? '', // Ensure string or empty string
       phone: client.phone ?? '',
       address: client.address ?? '',
       paymentTerms: client.paymentTerms ?? '',
   };

  // Initialize react-hook-form with the form schema and prepared defaults
  const form = useForm<ClientFormSchema>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: defaultFormValues,
  });

  // Reset form when dialog opens or client data changes externally
  useEffect(() => {
      if (isOpen) {
          // Re-calculate defaults in case client prop changed
          const currentDefaultValues: ClientFormSchema = {
               name: client.name,
               email: client.email ?? '',
               phone: client.phone ?? '',
               address: client.address ?? '',
               paymentTerms: client.paymentTerms ?? '',
           };
          form.reset(currentDefaultValues);
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, client]); // form.reset removed from dependencies


  const onSubmit = (data: ClientFormSchema) => {
     form.clearErrors();
     const formData = new FormData();
     formData.append('id', client.id); // Add the ID for the update action

     Object.entries(data).forEach(([key, value]) => {
       if (value !== undefined && value !== null && value !== '') { // Append non-empty strings/numbers
         formData.append(key, String(value));
       }
     });

    startTransition(async () => {
      const result = await updateClient(formData);
      if (result.success) {
        setIsOpen(false);
        toast({
          title: "Success",
          description: result.message,
        });
      } else {
         toast({
          title: "Error Updating Client",
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
         console.error("Error updating client:", result.error, result.fieldErrors);
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
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>
            Update the details for the client "{client.name}".
          </DialogDescription>
        </DialogHeader>
        <ClientForm
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
