
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
import { deleteAccount } from '@/lib/actions/accounts';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react'; // For loading indicator

interface DeleteAccountDialogProps {
  children: ReactNode; // Trigger element (e.g., Delete button)
  accountId: string;
  accountName: string;
}

export function DeleteAccountDialog({ children, accountId, accountName }: DeleteAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteAccount(accountId);
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
          description: result.message || "Failed to delete account.",
          variant: "destructive",
        });
         console.error("Error deleting account:", result.error);
         // Keep dialog open on error? Optionally close it: setIsOpen(false);
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
            account "{accountName}". Make sure this account has no associated
            transactions before proceeding.
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
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
