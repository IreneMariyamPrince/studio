
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountSchema, AccountSchema, accountTypes } from '@/lib/schemas/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Keep Label for structure if needed
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
import type { FC } from 'react'; // Import FC type

interface AccountFormProps {
  action: (formData: FormData) => void; // Expects a server action
  isPending: boolean; // To show loading state
  onCancel: () => void;
  defaultValues?: Partial<AccountSchema>; // For editing
  submitButtonText?: string; // Custom text for submit button
}

export const AccountForm: FC<AccountFormProps> = ({
  action,
  isPending,
  onCancel,
  defaultValues,
  submitButtonText = "Save Account"
}) => {
  const form = useForm<AccountSchema>({
    resolver: zodResolver(accountSchema),
    defaultValues: defaultValues || {
      code: '',
      name: '',
      type: undefined,
      description: '',
    },
  });

  // Handle form submission using the provided server action
  const onSubmit = (data: AccountSchema) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
     if (defaultValues?.id) { // Include ID if editing
      formData.append('id', defaultValues.id);
     }
    action(formData);
  };

  return (
    <Form {...form}>
      {/* Use form.handleSubmit which integrates with react-hook-form validation */}
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
                defaultValue={field.value}
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
          <Button type="submit" disabled={isPending}>
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
