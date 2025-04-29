
// Use 'use client' because @react-pdf/renderer components are client-side
// even though the rendering happens server-side in the Route Handler.
'use client';

import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import type { InvoiceSchema } from '@/lib/schemas/invoice'; // Import the types
import { format } from 'date-fns';

// Register fonts (optional, but recommended for consistent appearance)
// Example using Roboto (download .ttf files and place them in your project, e.g., public/fonts)
// Font.register({
//   family: 'Roboto',
//   fonts: [
//     { src: '/fonts/Roboto-Regular.ttf' },
//     { src: '/fonts/Roboto-Bold.ttf', fontWeight: 'bold' },
//   ],
// });

// Define styles using StyleSheet
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica', // Default font if others not registered
    fontSize: 11,
    paddingTop: 30,
    paddingLeft: 40,
    paddingRight: 40,
    paddingBottom: 30,
    lineHeight: 1.5,
    flexDirection: 'column',
    backgroundColor: '#FFFFFF', // White background
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingBottom: 10,
  },
  companyDetails: {
    flexDirection: 'column',
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'right',
    color: '#333333',
  },
  invoiceNumber: {
    fontSize: 12,
    textAlign: 'right',
    color: '#555555',
  },
  billTo: {
    marginTop: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billToDetails: {
    flexDirection: 'column',
  },
  billToLabel: {
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333333',
  },
  invoiceDetails: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  detailLabel: {
    fontWeight: 'bold',
    width: 80,
    textAlign: 'right',
    marginRight: 10,
    color: '#555555',
  },
  detailValue: {
     color: '#333333',
  },
  table: {
     // @ts-ignore - StyleSheet types might not be fully up-to-date
    display: "table",
    width: "auto",
    marginTop: 20,
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: '#EEEEEE',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    flexDirection: "row",
     borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
     alignItems: 'center',
     minHeight: 24, // Ensure minimum height for rows
     backgroundColor: '#FFFFFF', // Default row background
     '&:nth-child(even)': { // Requires custom logic if needed, PDF doesn't support :nth-child
       backgroundColor: '#F9F9F9',
     },
  },
   tableHeaderRow: {
     backgroundColor: '#F0F0F0', // Light gray for header
     fontWeight: 'bold', // Make header text bold
   },
  tableColHeader: {
    // @ts-ignore
    width: "20%", // Adjust widths as needed
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: '#EEEEEE',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
    textAlign: 'left', // Default align left for headers
  },
  tableCol: {
    // @ts-ignore
    width: "20%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: '#EEEEEE',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
     textAlign: 'left', // Default align left for cells
  },
  descriptionCol: {
    // @ts-ignore
    width: "40%", // Wider column for description
  },
  qtyCol: {
    // @ts-ignore
     width: "10%",
     textAlign: 'center', // Center quantity
  },
   priceCol: {
    // @ts-ignore
     width: "15%",
     textAlign: 'right', // Right align prices
   },
   totalCol: {
    // @ts-ignore
     width: "15%",
      textAlign: 'right', // Right align totals
   },
  totals: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalsContainer: {
    width: '40%', // Adjust as needed
    flexDirection: 'column',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
     paddingTop: 5,
     paddingBottom: 5,
     borderTopWidth: 1,
     borderTopColor: '#EEEEEE',
  },
  totalLabel: {
    fontWeight: 'bold',
     color: '#333333',
  },
  grandTotalRow: {
     fontWeight: 'bold',
     fontSize: 13, // Slightly larger font for grand total
  },
  totalValue: {
     color: '#333333',
  },
  notes: {
    marginTop: 30,
    fontSize: 10,
    color: '#555555',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#AAAAAA',
  },
});

// Format currency function (basic example)
const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

interface InvoicePdfDocumentProps {
  invoice: InvoiceSchema;
}

const InvoicePdfDocument: React.FC<InvoicePdfDocumentProps> = ({ invoice }) => {
   const subtotal = invoice.items.reduce((sum, item) => sum + item.total!, 0);
  // Add logic for tax, discounts if needed
   const total = subtotal; // Update if tax/discounts are added

   return (
  <Document title={`Invoice ${invoice.invoiceNumber}`}>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.companyDetails}>
          <Text>Your Company Name</Text>
          <Text>123 Business Rd.</Text>
          <Text>City, State, 12345</Text>
          <Text>your.email@example.com</Text>
        </View>
        <View>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
          <Text style={styles.invoiceNumber}># {invoice.invoiceNumber}</Text>
        </View>
      </View>

      {/* Bill To & Invoice Details */}
      <View style={styles.billTo}>
        <View style={styles.billToDetails}>
          <Text style={styles.billToLabel}>BILL TO:</Text>
          <Text>{invoice.client.name}</Text>
          {invoice.client.address && <Text>{invoice.client.address}</Text>}
          {invoice.client.email && <Text>{invoice.client.email}</Text>}
        </View>
        <View style={styles.invoiceDetails}>
           <View style={styles.detailRow}>
               <Text style={styles.detailLabel}>Issue Date:</Text>
               <Text style={styles.detailValue}>{format(new Date(invoice.issueDate), 'PP')}</Text>
            </View>
             <View style={styles.detailRow}>
               <Text style={styles.detailLabel}>Due Date:</Text>
               <Text style={styles.detailValue}>{format(new Date(invoice.dueDate), 'PP')}</Text>
            </View>
            <View style={styles.detailRow}>
               <Text style={styles.detailLabel}>Status:</Text>
               <Text style={styles.detailValue}>{invoice.status}</Text>
            </View>
        </View>
      </View>

      {/* Invoice Items Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={[styles.tableRow, styles.tableHeaderRow]} fixed>
          <Text style={[styles.tableColHeader, styles.descriptionCol]}>Description</Text>
          <Text style={[styles.tableColHeader, styles.qtyCol, {textAlign: 'center'}]}>Qty</Text>
          <Text style={[styles.tableColHeader, styles.priceCol, {textAlign: 'right'}]}>Unit Price</Text>
          <Text style={[styles.tableColHeader, styles.totalCol, {textAlign: 'right'}]}>Total</Text>
        </View>
        {/* Table Body */}
        {invoice.items.map((item, index) => (
          <View style={styles.tableRow} key={item.id || index}>
            <Text style={[styles.tableCol, styles.descriptionCol]}>{item.description}</Text>
            <Text style={[styles.tableCol, styles.qtyCol]}>{item.quantity}</Text>
            <Text style={[styles.tableCol, styles.priceCol]}>{formatCurrency(item.unitPrice)}</Text>
            <Text style={[styles.tableCol, styles.totalCol]}>{formatCurrency(item.total!)}</Text>
          </View>
        ))}
      </View>

      {/* Totals */}
       <View style={styles.totals}>
        <View style={styles.totalsContainer}>
           <View style={styles.totalRow}>
             <Text style={styles.totalLabel}>Subtotal:</Text>
             <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
           </View>
            {/* Add rows for Tax, Discounts here if applicable */}
            <View style={[styles.totalRow, styles.grandTotalRow]}>
             <Text style={styles.totalLabel}>TOTAL:</Text>
             <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
           </View>
         </View>
       </View>


      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.billToLabel}>Notes:</Text>
          <Text>{invoice.notes}</Text>
        </View>
      )}

      {/* Footer */}
       <Text style={styles.footer} fixed>
         Thank you for your business!
       </Text>
    </Page>
  </Document>
)};

export default InvoicePdfDocument;
