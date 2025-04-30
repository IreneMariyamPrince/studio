

'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Keep for basic labels if needed
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, PlusCircle, Trash2, Loader2 } from 'lucide-react';
import { useState, useEffect, useTransition } from 'react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoiceFormSchema, InvoiceFormSchema, invoiceStatus, InvoiceItemSchema } from '@/lib/schemas/invoice';
import { createInvoice, getClientsCollection } from '@/lib/actions/invoices'; // Import invoice actions
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

type ClientOption = { value: string; label: string };

export default function NewInvoicePage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Fetch clients on component mount
  useEffect(() => {
    async function fetchClients() {
      try {
        const clientData = await getClientsCollection(); // Call the imported function
        if (clientData.success && Array.isArray(clientData.data)) {
             setClients(clientData.data.map((c: { id: any; name: any; }) => ({ value: c.id!, label: c.name })));
        } else {
             throw new Error(clientData.message || "Failed to fetch clients");
        }

      } catch (error: any) {
          console.error("Failed to fetch clients:", error);
          toast({
              title: "Error Loading Clients",
              description: error.message || "Could not load clients. Please try again later.",
              variant: "destructive",
          })
      }
    }
    fetchClients();
  }, [toast]); // Added toast to dependency array

  const form = useForm<InvoiceFormSchema>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      clientId: undefined,
      issueDate: new Date(),
      dueDate: undefined,
      status: 'Draft',
      notes: '',
      items: '[{"description":"","quantity":1,"unitPrice":0}]', // Default one item as JSON string
      revenueAccountId: undefined,
    },
  });

  // Use useFieldArray for dynamic invoice items (managed outside RHF state for UI)
  const [invoiceItems, setInvoiceItems] = useState<Partial<InvoiceItemSchema>[]>([
    { id: `temp-${Date.now()}`, description: '', quantity: 1, unitPrice: 0 }
  ]);

  // Update RHF 'items' field whenever local invoiceItems state changes
  useEffect(() => {
    const itemsForRHF = invoiceItems.map(({ id, ...rest }) => rest); // Remove temporary UI id
    form.setValue('items', JSON.stringify(itemsForRHF), { shouldValidate: true, shouldDirty: true }); // Trigger validation and dirty state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceItems]); // Removed form from dependencies


  const handleItemChange = (index: number, field: keyof InvoiceItemSchema, value: string | number) => {
     setInvoiceItems(currentItems =>
      currentItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const addItem = () => {
    setInvoiceItems([...invoiceItems, { id: `temp-${Date.now()}`, description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (invoiceItems.length > 1) { // Prevent removing the last item
      setInvoiceItems(currentItems => currentItems.filter((_, i) => i !== index));
    }
  };

   const calculateItemTotal = (item: Partial<InvoiceItemSchema>): number => {
      return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
   };

  const calculateSubtotal = () => {
     return invoiceItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  };

  const calculateTotal = () => {
    // Add tax/discount logic here if needed
    return calculateSubtotal();
  };


  const onSubmit = (data: InvoiceFormSchema) => {
     console.log("RHF Data before FormData:", data); // Log RHF data
    const formData = new FormData();

    // Append standard form data
     Object.entries(data).forEach(([key, value]) => {
        if (key === 'items') return; // Handle items separately
        if (value instanceof Date) {
            formData.append(key, value.toISOString());
        } else if (value !== undefined && value !== null) {
            formData.append(key, String(value));
        }
     });

     // Append items as JSON string (already handled by RHF state update)
     formData.append('items', data.items);

     console.log("FormData contents:"); // Log FormData contents
      for (const pair of formData.entries()) {
        console.log(pair[0] + ', ' + pair[1]);
      }

    startTransition(async () => {
      const result = await createInvoice(formData);
      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
        router.push('/invoices'); // Redirect on success
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to create invoice.",
          variant: "destructive",
        });
         console.error("Error creating invoice:", result.error);
         // Optionally highlight fields with errors
         if (result.fieldErrors) { // Updated to check fieldErrors
             Object.entries(result.fieldErrors).forEach(([fieldName, errors]) => {
                 if (Array.isArray(errors) && errors.length > 0) {
                     form.setError(fieldName as keyof InvoiceFormSchema, { type: 'manual', message: errors[0] });
                 }
             });
         }
      }
    });
  };

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold mb-6">Create New Invoice</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>Fill in the details to create a new invoice.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {/* Client Selection */}
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value} // Use value and handle undefined/null case for placeholder
                      disabled={isPending || clients.length === 0}
                    >
                      {clients.length === 0 ? (
                       <FormControl>
                         <SelectTrigger disabled>
                           <SelectValue placeholder="Loading clients..." />
                         </SelectTrigger>
                       </FormControl>
                         ) : (
                         <FormControl>
                           <SelectTrigger>
                             <SelectValue placeholder="Select a client" />
                           </SelectTrigger>
                         </FormControl>
                       )}
                      <SelectContent>
                        {/* <SelectItem value="" disabled>Select a client</SelectItem> */}
                        {clients.map((client) => (
                          <SelectItem key={client.value} value={client.value}>
                            {client.label}
                          </SelectItem>
                        ))}
                         {/* Option to add new client? */}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
               {/* Add client email/address fields here if needed, or fetch after selection */}


            {/* Invoice Dates */}
            <div className="grid md:grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Issue Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isPending}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                           disabled={isPending}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
               />
                <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isPending}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                           disabled={isPending}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
               />
            </div>

            {/* Invoice Items - Rendered from local state `invoiceItems` */}
             <div className="space-y-4">
                <Label>Invoice Items</Label>
                <FormField
                    control={form.control}
                    name="items"
                    render={() => ( // RHF field just for validation trigger
                        <FormItem>
                           {/* No visual label, just for RHF validation */}
                           {/* <FormLabel className="sr-only">Invoice Items</FormLabel> */}
                           <FormControl>
                              <div className="border rounded-md">
                                 {/* Header Row */}
                                 <div className="grid grid-cols-12 gap-2 p-2 bg-muted rounded-t-md font-medium text-sm">
                                    <div className="col-span-12 md:col-span-5">Description</div>
                                    <div className="col-span-4 md:col-span-2 text-center">Quantity</div>
                                    <div className="col-span-4 md:col-span-2 text-right">Unit Price</div>
                                    <div className="col-span-3 md:col-span-2 text-right">Total</div>
                                    <div className="col-span-1"></div> {/* Actions */}
                                 </div>
                                 {/* Item Rows */}
                                 {invoiceItems.map((item, index) => (
                                    <div key={item.id || index} className="grid grid-cols-12 gap-2 p-2 border-t items-center">
                                       <div className="col-span-12 md:col-span-5">
                                          <Input
                                             placeholder="Item description"
                                             value={item.description || ''}
                                             onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                             className="h-8"
                                             disabled={isPending}
                                             required // Basic HTML5 required
                                          />
                                       </div>
                                       <div className="col-span-4 md:col-span-2">
                                          <Input
                                             type="number"
                                             placeholder="Qty"
                                             value={item.quantity || 1}
                                             onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                                             className="h-8 text-center"
                                             min="1"
                                             disabled={isPending}
                                             required
                                          />
                                       </div>
                                       <div className="col-span-4 md:col-span-2">
                                          <Input
                                             type="number"
                                             placeholder="Price"
                                             value={item.unitPrice || 0}
                                             onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                                             className="h-8 text-right"
                                             min="0"
                                             step="0.01"
                                             disabled={isPending}
                                             required
                                          />
                                       </div>
                                       <div className="col-span-3 md:col-span-2 text-right text-sm flex items-center justify-end pr-2">
                                          ${calculateItemTotal(item).toFixed(2)}
                                       </div>
                                       <div className="col-span-1 flex justify-end">
                                          <Button
                                             type="button" // Prevent form submission
                                             variant="ghost"
                                             size="icon"
                                             className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                             onClick={() => removeItem(index)}
                                             disabled={invoiceItems.length <= 1 || isPending}
                                             title="Remove Item"
                                          >
                                             <Trash2 className="h-4 w-4" />
                                             <span className="sr-only">Remove Item</span>
                                          </Button>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </FormControl>
                            <FormMessage /> {/* Show validation errors for the 'items' field */}
                        </FormItem>
                     )}
                />
                 <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={isPending}>
                   <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                 </Button>
             </div>


            {/* Totals Section */}
            <div className="flex justify-end">
              <div className="w-full md:w-1/3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>${calculateSubtotal().toFixed(2)}</span>
                </div>
                {/* Add Tax/Discount rows here if needed */}
                <div className="flex justify-between font-semibold text-lg border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>${calculateTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>

             {/* Status */}
             <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                        <FormControl>
                        <SelectTrigger className="w-full md:w-1/2">
                            <SelectValue placeholder="Select invoice status" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        {invoiceStatus.map((status) => (
                            <SelectItem key={status} value={status}>
                            {status}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes for the client (optional)"
                      {...field}
                      value={field.value ?? ''} // Handle null/undefined
                      disabled={isPending}
                     />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  'Create Invoice'
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </DashboardLayout>
  );
}



