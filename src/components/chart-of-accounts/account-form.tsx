
'use client';

import type { UseFormReturn } from 'react-hook-form'; // Import UseFormReturn type
import { accountSchema, AccountSchema, accountTypes } from '@/lib/schemas/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label'; // Can be removed if using FormLabel
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { FC } from 'react';

interface AccountFormProps {
  // action: (formData: FormData) => void; // Removed: Now handled by onSubmit
  form: UseFormReturn<AccountSchema>; // Accept react-hook-form instance
  onSubmit: (data: AccountSchema) => void; // Callback for form submission
  isPending: boolean; // To show loading state
  onCancel: () => void;
  // defaultValues prop is handled by the form instance passed in
  submitButtonText?: string; // Custom text for submit button
}

export const AccountForm: FC<AccountFormProps> = ({
  form, // Use the passed form instance
  onSubmit,
  isPending,
  onCancel,
  submitButtonText = "Save Account",
}) => {
  // The form instance (including resolver and defaultValues) is now managed by the parent component (e.g., AddAccountDialog, EditAccountDialog)

  return (
    <Form {...form}>
      {/* Use form.handleSubmit provided by react-hook-form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Code</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 1010" {...field} disabled={isPending} />
              </FormControl>
              <FormMessage /> {/* Displays validation errors */}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Cash" {...field} disabled={isPending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value} // Use value from form state
                value={field.value} // Controlled component
                disabled={isPending}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {accountTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter a brief description"
                  {...field}
                  value={field.value ?? ''} // Ensure value is not null/undefined for textarea
                  disabled={isPending}
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !form.formState.isDirty}> {/* Optionally disable if form not dirty */}
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              submitButtonText
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};
