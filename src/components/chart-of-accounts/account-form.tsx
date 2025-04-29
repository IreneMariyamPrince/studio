import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountSchema, AccountSchema, accountTypes } from '@/lib/schemas/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { DialogFooter } from '@/components/ui/dialog'; // Import DialogFooter

interface AccountFormProps {
  onSubmit: (data: AccountSchema) => void;
  onCancel: () => void;
  defaultValues?: Partial<AccountSchema>; // For editing
}

export const AccountForm: FC<AccountFormProps> = ({ onSubmit, onCancel, defaultValues }) => {
  const form = useForm<AccountSchema>({
    resolver: zodResolver(accountSchema),
    defaultValues: defaultValues || {
      code: '',
      name: '',
      type: undefined,
      description: '',
    },
  });

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
                <Input placeholder="e.g., 1010" {...field} />
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
                <Input placeholder="e.g., Cash" {...field} />
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                <Textarea placeholder="Enter a brief description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit">Save Account</Button>
         </DialogFooter>
      </form>
    </Form>
  );
};
