
'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
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
import { Button } from '@/components/ui/button';
import { deleteInvoice } from '@/lib/actions/invoices'; // Import the delete action
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react'; // For loading indicator

interface DeleteInvoiceDialogProps {
  children: ReactNode; // Trigger element (e.g., Delete button)
  invoiceId: string;
  invoiceNumber: string;
}

export function DeleteInvoiceDialog({ children, invoiceId, invoiceNumber }: DeleteInvoiceDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteInvoice(invoiceId);
      if (result.success) {
        setIsOpen(false); // Close the dialog on success
        toast({
          title: "Success",
          description: result.message,
        });
        // Revalidation handled by server action
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to delete invoice.",
          variant: "destructive",
        });
         console.error("Error deleting invoice:", result.error);
         // Optionally close dialog on error too: setIsOpen(false);
      }
    });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            invoice "{invoiceNumber}". Associated invoice items will also be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
           <AlertDialogCancel disabled={isPending} onClick={() => setIsOpen(false)}>
              Cancel
           </AlertDialogCancel>
           <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90" // Style as destructive action
           >
            {isPending ? (
              <>
                 <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
               </>
            ) : (
              'Delete Invoice'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
