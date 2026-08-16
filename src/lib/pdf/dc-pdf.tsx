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
  colQty: { width: "15%" },
  colUnit: { width: "15%" },
  colRemarks: { width: "30%" },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  sigBox: { width: "45%", borderTopWidth: 1, borderTopColor: "#000", paddingTop: 4, textAlign: "center" },
});

export type DcPdfData = {
  dc_number: string;
  dc_date: string;
  vehicle_number: string | null;
  driver_name: string | null;
  authorized_by: string | null;
  remarks: string | null;
  customer: { name: string; address: string | null; phone: string | null; gst_number: string | null } | null;
  items: { description: string; quantity: number; unit: string; remarks: string | null }[];
};

export function DcPdfDocument({ dc }: { dc: DcPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>Oviya Engineers</Text>
            <Text style={styles.muted}>Precision Engineering & Fabrication</Text>
          </View>
          <View>
            <Text>DC No: {dc.dc_number}</Text>
            <Text>Date: {new Date(dc.dc_date).toLocaleDateString("en-IN")}</Text>
          </View>
        </View>

        <Text style={styles.title}>DELIVERY CHALLAN</Text>

        <View style={styles.section}>
          <View style={styles.box}>
            <Text style={styles.label}>Customer</Text>
            <Text>{dc.customer?.name ?? "-"}</Text>
            <Text>{dc.customer?.address ?? ""}</Text>
            <Text>{dc.customer?.phone ?? ""}</Text>
            {dc.customer?.gst_number && <Text>GST: {dc.customer.gst_number}</Text>}
          </View>
          <View style={styles.box}>
            <Text style={styles.label}>Transport</Text>
            <Text>Vehicle No: {dc.vehicle_number ?? "-"}</Text>
            <Text>Driver: {dc.driver_name ?? "-"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            <Text style={[styles.th, styles.colRemarks]}>Remarks</Text>
          </View>
          {dc.items.map((item, i) => (
            <View style={styles.tr} key={i}>
              <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.td, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.td, styles.colRemarks]}>{item.remarks ?? ""}</Text>
            </View>
          ))}
        </View>

        {dc.remarks && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Remarks</Text>
            <Text>{dc.remarks}</Text>
          </View>
        )}

        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text>Receiver&apos;s Signature</Text>
          </View>
          <View style={styles.sigBox}>
            <Text>{dc.authorized_by || "Authorized Signatory"}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
