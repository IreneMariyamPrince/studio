'use client';

import type { UseFormReturn } from 'react-hook-form';
import { accountFormSchema, AccountFormSchema, accountTypes } from '@/lib/schemas/account'; // Use AccountFormSchema
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox
import {
  Form,
  FormControl,
  FormDescription, // Import FormDescription
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { FC } from 'react';

interface AccountFormProps {
  form: UseFormReturn<AccountFormSchema>; // Use the form schema type
  onSubmit: (data: AccountFormSchema) => void;
  isPending: boolean;
  onCancel: () => void;
  submitButtonText?: string;
}

export const AccountForm: FC<AccountFormProps> = ({
  form,
  onSubmit,
  isPending,
  onCancel,
  submitButtonText = "Save Account",
}) => {

  return (
    <Form {...form}>
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
              <FormMessage />
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
                  value={field.value ?? ''} // Handle null/undefined
                  disabled={isPending}
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         {/* isActive Checkbox */}
         <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                <FormControl>
                    <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isPending}
                    />
                </FormControl>
                <div className="space-y-1 leading-none">
                    <FormLabel>
                    Active Account
                    </FormLabel>
                    <FormDescription>
                    Inactive accounts cannot be used in new transactions.
                    </FormDescription>
                </div>
                 <FormMessage />
                </FormItem>
            )}
            />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !form.formState.isDirty}>
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
