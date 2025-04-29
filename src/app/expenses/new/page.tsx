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
import { CalendarIcon, Upload } from 'lucide-react';
import { useState } from 'react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Mock data for categories - replace with actual data
const expenseCategories = [
    { value: 'office_supplies', label: 'Office Supplies' },
    { value: 'travel', label: 'Travel' },
    { value: 'software', label: 'Software Subscription' },
    { value: 'meals', label: 'Meals & Entertainment' },
    { value: 'rent', label: 'Rent/Utilities' },
    { value: 'other', label: 'Other' },
];

export default function NewExpensePage() {
  const [expenseDate, setExpenseDate] = useState<Date | undefined>(new Date());
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();

  // Add state and handlers for form fields

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold mb-6">Add New Expense</h1>

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
          <CardDescription>Enter the details of the expense.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
           {/* Date */}
          <div className="space-y-2">
             <Label htmlFor="expenseDate">Date of Expense</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full md:w-1/2 justify-start text-left font-normal", // Adjust width
                    !expenseDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expenseDate ? format(expenseDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={expenseDate}
                  onSelect={setExpenseDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

           {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger id="category" className="w-full md:w-1/2">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

           {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
               <div className="relative">
                 <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">$</span>
                 <Input id="amount" type="number" placeholder="0.00" className="pl-7 w-full md:w-1/2" min="0" step="0.01" />
               </div>
            </div>

           {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Enter a brief description of the expense" />
            </div>

           {/* Receipt Upload (Placeholder) */}
            <div className="space-y-2">
                <Label htmlFor="receipt">Receipt (Optional)</Label>
                <div className="flex items-center justify-center w-full">
                    <Label
                        htmlFor="receipt-upload"
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80"
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 mb-3 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground">
                                <span className="font-semibold">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-xs text-muted-foreground">PNG, JPG, PDF (MAX. 5MB)</p>
                        </div>
                        <Input id="receipt-upload" type="file" className="hidden" />
                         {/* Add file handling logic here */}
                    </Label>
                </div>
            </div>

        </CardContent>
        <CardFooter className="flex justify-end gap-2">
           <Button variant="outline">Cancel</Button>
           <Button>Save Expense</Button>
        </CardFooter>
      </Card>
    </DashboardLayout>
  );
}
