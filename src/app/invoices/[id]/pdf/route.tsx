
import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceById } from '@/lib/actions/invoices';
import InvoicePdfDocument from '@/components/invoice/invoice-pdf-document';
import { renderToStream } from '@react-pdf/renderer';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoiceId = params.id;

  if (!invoiceId) {
    return new NextResponse('Invoice ID is required', { status: 400 });
  }

  try {
    const invoice = await getInvoiceById(invoiceId);

    if (!invoice) {
      return new NextResponse('Invoice not found', { status: 404 });
    }

    // Render the PDF to a stream
    const pdfStream = await renderToStream(<InvoicePdfDocument invoice={invoice} />);

    // Set headers for PDF download/display
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    // Optional: Suggest a filename for download
    headers.set('Content-Disposition', `inline; filename="invoice-${invoice.invoiceNumber || invoice.id}.pdf"`);

    // Return the stream as the response body
    return new NextResponse(pdfStream as any, { status: 200, headers });

  } catch (error) {
    console.error(`Error generating PDF for invoice ${invoiceId}:`, error);
    return new NextResponse('Failed to generate PDF', { status: 500 });
  }
}
