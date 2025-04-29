import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import Link from 'next/link';
import { getVendors } from '@/lib/actions/vendors'; // Adjust path if needed
import type { VendorSchema } from '@/lib/schemas/vendor';
// Import Add/Edit/Delete dialogs when created
// import { AddVendorDialog } from './_components/add-vendor-dialog';
// import { EditVendorDialog } from './_components/edit-vendor-dialog';
// import { DeleteVendorDialog } from './_components/delete-vendor-dialog';
import 'server-only';

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function VendorsPage() {
  const vendors: VendorSchema[] = await getVendors();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Vendors</h1>
        {/* <AddVendorDialog> */}
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Vendor (Not Implemented)
          </Button>
        {/* </AddVendorDialog> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendor List</CardTitle>
          <CardDescription>Manage your supplier information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>List of your vendors.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="text-right">Balance Owed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell>{vendor.email || '-'}</TableCell>
                  <TableCell>{vendor.phone || '-'}</TableCell>
                  <TableCell>{vendor.paymentTerms || '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(vendor.balanceOwed)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {/* <EditVendorDialog vendor={vendor}> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                         <Edit className="h-4 w-4" />
                         <span className="sr-only">Edit Vendor</span>
                       </Button>
                     {/* </EditVendorDialog> */}
                    {/* <DeleteVendorDialog vendorId={vendor.id!} vendorName={vendor.name}> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled>
                         <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete Vendor</span>
                       </Button>
                    {/* </DeleteVendorDialog> */}
                  </TableCell>
                </TableRow>
              ))}
              {vendors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No vendors found. Add a new vendor to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
