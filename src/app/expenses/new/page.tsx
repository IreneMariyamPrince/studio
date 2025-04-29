'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Upload, Loader2 } from 'lucide-react';
import { useState, useEffect, useTransition } from 'react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { expenseFormSchema, ExpenseFormSchema, expenseStatus } from '@/lib/schemas/expense';
import { getExpenseCategories, addExpense } from '@/lib/actions/expenses'; // Import expense actions
import { getVendors } from '@/lib/actions/vendors'; // Import vendor action
// import { getTaxRates } from '@/lib/actions/taxRates'; // Import tax rates action (when created)
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation'; // To redirect after success
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox'; // For isRecurring

type SelectOption = { value: string; label: string };

export default function NewExpensePage() {
  const [expenseCategories, setExpenseCategories] = useState<SelectOption[]>([]);
  const [vendors, setVendors] = useState<SelectOption[]>([]);
  // const [taxRates, setTaxRates] = useState<SelectOption[]>([]); // State for tax rates
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Fetch categories and vendors on component mount
  useEffect(() => {
    async function fetchData() {
      const [categoriesData, vendorsData /* , taxRatesData */] = await Promise.all([
        getExpenseCategories(),
        getVendors(),
        // getTaxRates(), // Fetch tax rates when action exists
      ]);
      setExpenseCategories(categoriesData);
      setVendors(vendorsData.map(v => ({ value: v.id!, label: v.name })));
      // setTaxRates(taxRatesData.map(t => ({ value: t.id!, label: `${t.name} (${t.ratePercent}%)` })));
    }
    fetchData();
  }, []);

  const form = useForm<ExpenseFormSchema>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: new Date(),
      accountId: undefined,
      amount: undefined,
      description: '',
      status: 'Pending', // Default status
      vendorId: undefined,
      isRecurring: false,
      recurrenceRule: '',
      taxRateId: undefined,
      // receiptFile: undefined, // If handling file uploads
    },
  });

  const onSubmit = (data: ExpenseFormSchema) => {
    const formData = new FormData();

    // Append form data
    Object.entries(data).forEach(([key, value]) => {
      if (value instanceof Date) {
        formData.append(key, value.toISOString()); // Send dates as ISO strings
      } else if (typeof value === 'boolean') {
          formData.append(key, value ? 'true' : 'false');
      } else if (value !== undefined && value !== null && !(value instanceof File)) { // Exclude files for now
        formData.append(key, String(value));
      }
    });

     // TODO: Handle file upload - this requires server-side storage setup (e.g., Firebase Storage)
     // const receiptFile = data.receiptFile?.[0]; // Assuming using react-hook-form register
     // if (receiptFile) {
     //     formData.append('receiptFile', receiptFile);
     // }

    startTransition(async () => {
      const result = await addExpense(formData); // Server action handles DB insertion and file URL saving
      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
        router.push('/expenses'); // Redirect to expenses list on success
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to add expense.",
          variant: "destructive",
        });
         console.error("Error adding expense:", result.error);
         // Handle field errors
         if (result.fieldErrors) {
             Object.entries(result.fieldErrors).forEach(([field, errors]) => {
                 form.setError(field as keyof ExpenseFormSchema, { type: 'server', message: errors?.[0] });
             });
         }
      }
    });
  };

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold mb-6">Add New Expense</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Expense Details</CardTitle>
              <CardDescription>Enter the details of the expense.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {/* Date */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date of Expense</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full md:w-1/2 justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isPending}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date() || date < new Date("1900-01-01") || isPending}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category (Account) */}
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (Account)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full md:w-1/2">
                          <SelectValue placeholder="Select an expense category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expenseCategories.length === 0 && <SelectItem value="loading" disabled>Loading categories...</SelectItem>}
                        {expenseCategories.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

             {/* Vendor */}
              <FormField
                control={form.control}
                name="vendorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || ""} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full md:w-1/2">
                          <SelectValue placeholder="Select a vendor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">-- No Vendor --</SelectItem>
                        {vendors.length === 0 && <SelectItem value="loading" disabled>Loading vendors...</SelectItem>}
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.value} value={vendor.value}>
                            {vendor.label}
                          </SelectItem>
                        ))}
                        {/* Consider adding a "Add New Vendor" option here */}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Amount */}
               <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                   <FormItem>
                      <FormLabel>Amount</FormLabel>
                     <div className="relative w-full md:w-1/2">
                       <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">$</span>
                       <FormControl>
                          <Input
                            type="number"
                            placeholder="0.00"
                            className="pl-7"
                            min="0.01"
                            step="0.01"
                            {...field}
                            onChange={event => field.onChange(event.target.value === '' ? undefined : +event.target.value)} // Handle empty string
                            value={field.value ?? ''} // Control value, handle undefined
                            disabled={isPending}
                          />
                       </FormControl>
                     </div>
                      <FormMessage />
                   </FormItem>
                )}
               />

              {/* Description */}
               <FormField
                 control={form.control}
                 name="description"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Description</FormLabel>
                     <FormControl>
                       <Textarea
                         placeholder="Enter a brief description of the expense (optional)"
                         {...field}
                         value={field.value ?? ''} // Handle undefined
                         disabled={isPending}
                       />
                     </FormControl>
                     <FormMessage />
                   </FormItem>
                 )}
               />

             {/* Tax Rate (Optional) */}
              <FormField
                control={form.control}
                name="taxRateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (Optional)</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || ""} disabled={isPending}>
                       <FormControl>
                         <SelectTrigger className="w-full md:w-1/2">
                           <SelectValue placeholder="Select a tax rate" />
                         </SelectTrigger>
                       </FormControl>
                       <SelectContent>
                           <SelectItem value="">-- No Tax --</SelectItem>
                           {/* {taxRates.length === 0 && <SelectItem value="loading" disabled>Loading tax rates...</SelectItem>}
                           {taxRates.map((rate) => (
                             <SelectItem key={rate.value} value={rate.value}>
                               {rate.label}
                             </SelectItem>
                           ))} */}
                           <SelectItem value="coming_soon" disabled>Tax Rates Coming Soon</SelectItem>
                       </SelectContent>
                     </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />


              {/* Receipt Upload */}
              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt (Optional)</Label>
                <div className="flex items-center justify-center w-full">
                  <Label
                    htmlFor="receipt-upload"
                    className={cn(
                        "flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-muted/50",
                        isPending ? "cursor-not-allowed opacity-50" : "hover:bg-muted/80"
                    )}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, PDF (MAX. 5MB) - Firebase Storage Setup Required</p>
                    </div>
                     {/* Input is controlled by react-hook-form if using file handling */}
                     <Input id="receipt-upload" type="file" className="hidden" disabled={isPending /* || !firebaseConfigured */} /* {...form.register('receiptFile')} */ />
                  </Label>
                </div>
                 {/* <FormMessage>{form.formState.errors.receiptFile?.message}</FormMessage> */}
              </div>

             {/* Recurring Expense */}
             <FormField
                control={form.control}
                name="isRecurring"
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
                        Recurring Expense
                        </FormLabel>
                        <FormDescription>
                        Mark this if the expense occurs regularly. (Rule setup coming soon)
                        </FormDescription>
                    </div>
                     <FormMessage />
                    </FormItem>
                )}
                />
                {/* Conditionally show Recurrence Rule input */}
                {form.watch('isRecurring') && (
                     <FormField
                     control={form.control}
                     name="recurrenceRule"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Recurrence Rule (Optional)</FormLabel>
                         <FormControl>
                           <Input
                             placeholder="e.g., FREQ=MONTHLY;INTERVAL=1 (RRULE format - coming soon)"
                             {...field}
                             value={field.value ?? ''}
                             disabled={true /* Enable when parsing logic is added */}
                           />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                )}


            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save Expense'
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </DashboardLayout>
  );
}
