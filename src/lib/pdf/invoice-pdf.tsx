import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  companyName: { fontSize: 16, fontWeight: 700 },
  muted: { color: "#555" },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 8, textAlign: "center" },
  section: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  box: { width: "48%" },
  label: { fontWeight: 700, marginBottom: 2 },
  table: { marginTop: 8, borderWidth: 1, borderColor: "#ccc" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ccc" },
  th: { padding: 6, fontWeight: 700, backgroundColor: "#f1f5f9" },
  td: { padding: 6 },
  colDesc: { width: "40%" },
  colQty: { width: "12%" },
  colUnit: { width: "12%" },
  colPrice: { width: "18%", textAlign: "right" },
  colAmount: { width: "18%", textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 4, borderTopWidth: 1, borderTopColor: "#000", fontWeight: 700 },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  sigBox: { width: "45%", borderTopWidth: 1, borderTopColor: "#000", paddingTop: 4, textAlign: "center" },
});

export type InvoicePdfData = {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  gst_rate: number;
  gst_amount: number;
  discount: number;
  grand_total: number;
  notes: string | null;
  customer: { name: string; address: string | null; phone: string | null; gst_number: string | null } | null;
  items: { description: string; quantity: number; unit: string; unit_price: number; amount: number }[];
};

export function InvoicePdfDocument({ invoice }: { invoice: InvoicePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>Oviya Engineers</Text>
            <Text style={styles.muted}>Precision Engineering & Fabrication</Text>
          </View>
          <View>
            <Text>Invoice No: {invoice.invoice_number}</Text>
            <Text>Date: {new Date(invoice.invoice_date).toLocaleDateString("en-IN")}</Text>
            {invoice.due_date && (
              <Text>Due: {new Date(invoice.due_date).toLocaleDateString("en-IN")}</Text>
            )}
          </View>
        </View>

        <Text style={styles.title}>TAX INVOICE</Text>

        <View style={styles.section}>
          <View style={styles.box}>
            <Text style={styles.label}>Bill To</Text>
            <Text>{invoice.customer?.name ?? "-"}</Text>
            <Text>{invoice.customer?.address ?? ""}</Text>
            <Text>{invoice.customer?.phone ?? ""}</Text>
            {invoice.customer?.gst_number && <Text>GST: {invoice.customer.gst_number}</Text>}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            <Text style={[styles.th, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          {invoice.items.map((item, i) => (
            <View style={styles.tr} key={i}>
              <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.td, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.td, styles.colPrice]}>{item.unit_price.toFixed(2)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{item.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>₹{invoice.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>GST ({invoice.gst_rate}%)</Text>
            <Text>₹{invoice.gst_amount.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Discount</Text>
            <Text>-₹{invoice.discount.toFixed(2)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text>Grand Total</Text>
            <Text>₹{invoice.grand_total.toFixed(2)}</Text>
          </View>
        </View>

        {invoice.notes && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text>Customer Signature</Text>
          </View>
          <View style={styles.sigBox}>
            <Text>Authorized Signatory</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
