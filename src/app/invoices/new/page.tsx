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
import { CalendarIcon, PlusCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function NewInvoicePage() {
  const [issueDate, setIssueDate] = useState<Date | undefined>(new Date());
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: 1, description: '', quantity: 1, unitPrice: 0, total: 0 }
  ]);

  const handleItemChange = (id: number, field: keyof InvoiceItem, value: string | number) => {
    setItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unitPrice') {
            updatedItem.total = (Number(updatedItem.quantity) || 0) * (Number(updatedItem.unitPrice) || 0);
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const addItem = () => {
    const newId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
    setItems([...items, { id: newId, description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  const removeItem = (id: number) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotal = () => {
    // Add tax/discount logic here if needed
    return calculateSubtotal();
  };

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold mb-6">Create New Invoice</h1>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
          <CardDescription>Fill in the details to create a new invoice.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
           {/* Client Information */}
           <div className="grid md:grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              {/* Replace with a Select or Autocomplete component later */}
              <Input id="clientName" placeholder="Select or enter client name" />
            </div>
             <div className="space-y-2">
              <Label htmlFor="clientEmail">Client Email</Label>
              <Input id="clientEmail" type="email" placeholder="client@example.com" />
            </div>
           </div>
           <div className="space-y-2">
              <Label htmlFor="clientAddress">Client Address</Label>
              <Textarea id="clientAddress" placeholder="Enter client's address" />
            </div>

            {/* Invoice Dates */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !issueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {issueDate ? format(issueDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={issueDate}
                      onSelect={setIssueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                 <Label htmlFor="dueDate">Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

           {/* Invoice Items */}
          <div className="space-y-4">
             <Label>Invoice Items</Label>
             <div className="border rounded-md">
                {/* Header Row (Hidden on small screens potentially) */}
                <div className="grid grid-cols-12 gap-2 p-2 bg-muted rounded-t-md font-medium text-sm">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1"></div> {/* Actions */}
                </div>
                {/* Item Rows */}
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 p-2 border-t items-center">
                    <div className="col-span-12 md:col-span-5">
                       <Input
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                        className="h-8 text-center"
                        min="1"
                      />
                    </div>
                     <div className="col-span-4 md:col-span-2">
                      <Input
                        type="number"
                        placeholder="Price"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value))}
                        className="h-8 text-right"
                         min="0"
                         step="0.01"
                      />
                     </div>
                     <div className="col-span-3 md:col-span-2 text-right text-sm flex items-center justify-end pr-2">
                       ${item.total.toFixed(2)}
                     </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Remove Item</span>
                      </Button>
                    </div>
                  </div>
                ))}
             </div>
              <Button variant="outline" size="sm" onClick={addItem}>
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

           {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Add any notes for the client (optional)" />
            </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
            <Button variant="outline">Save Draft</Button>
           <Button>Generate Invoice</Button>
        </CardFooter>
      </Card>
    </DashboardLayout>
  );
}
