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
import { getClients } from '@/lib/actions/clients'; // Adjust path if needed
import type { ClientSchema } from '@/lib/schemas/client';
// Import Add/Edit/Delete dialogs when created
// import { AddClientDialog } from './_components/add-client-dialog';
// import { EditClientDialog } from './_components/edit-client-dialog';
// import { DeleteClientDialog } from './_components/delete-client-dialog';
import 'server-only';

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function ClientsPage() {
  const clients: ClientSchema[] = await getClients();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Clients</h1>
        {/* <AddClientDialog> */}
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Client (Not Implemented)
          </Button>
        {/* </AddClientDialog> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client List</CardTitle>
          <CardDescription>Manage your customer information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>List of your clients.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.email || '-'}</TableCell>
                  <TableCell>{client.phone || '-'}</TableCell>
                  <TableCell>{client.paymentTerms || '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(client.balanceDue)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {/* <EditClientDialog client={client}> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                         <Edit className="h-4 w-4" />
                         <span className="sr-only">Edit Client</span>
                       </Button>
                    {/* </EditClientDialog> */}
                    {/* <DeleteClientDialog clientId={client.id!} clientName={client.name}> */}
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled>
                         <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete Client</span>
                       </Button>
                    {/* </DeleteClientDialog> */}
                  </TableCell>
                </TableRow>
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No clients found. Add a new client to get started.
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
