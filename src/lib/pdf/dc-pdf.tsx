import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#10233f";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: { alignItems: "center", marginBottom: 16 },
  companyName: { fontSize: 16, fontWeight: 700, textAlign: "center" },
  muted: { color: "#555" },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
    textAlign: "center",
    color: NAVY,
    textDecoration: "underline",
  },
  section: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" },
  box: { width: "48%", marginBottom: 8 },
  label: { fontWeight: 700, marginBottom: 2, color: NAVY },
  table: { marginTop: 8, borderWidth: 1, borderColor: "#d9dee7" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d9dee7" },
  th: { padding: 6, fontWeight: 700, backgroundColor: "#eef2f7", textAlign: "center" },
  td: { padding: 6, textAlign: "center" },
  colComponent: { width: "20%" },
  colMaterial: { width: "18%" },
  colReceived: { width: "13%" },
  colSent: { width: "13%" },
  colMaterialProblem: { width: "15%" },
  colRejection: { width: "10%" },
  colTotal: { width: "11%" },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  sigBox: { width: "45%", borderTopWidth: 1, borderTopColor: "#000", paddingTop: 4, textAlign: "center" },
});

export type DcPdfData = {
  dc_number: string;
  dc_date: string;
  customer_dc_number: string[] | null;
  customer_dc_date: (string | null)[] | null;
  job_order_no: string | null;
  vehicle_number: string | null;
  authorized_by: string | null;
  remarks: string | null;
  customer: { name: string; address: string | null; phone: string | null; gst_number: string | null } | null;
  items: {
    component: string;
    material: string | null;
    received_qty: number;
    sent_qty: number;
    material_problem_qty: number;
    rejection_qty: number;
    total_qty: number;
  }[];
};

export function DcPdfDocument({ dc }: { dc: DcPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* TODO: company logo goes here once available */}
          <Text style={[styles.companyName, { color: NAVY }]}>OVIYA ENGINEERS</Text>
          <Text style={[styles.muted, { textAlign: "center" }]}>
            40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
          </Text>
          <Text style={[styles.muted, { textAlign: "center" }]}>
            Ph: 9965902970, 9965702970
          </Text>
        </View>

        <Text style={styles.title}>DELIVERY CHALLAN</Text>

        <View style={styles.section}>
          <View style={styles.box}>
            <Text style={styles.label}>Our DC</Text>
            <Text>DC No: {dc.dc_number}</Text>
            <Text>Date: {new Date(dc.dc_date).toLocaleDateString("en-IN")}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.label}>Customer</Text>
            <Text>{dc.customer?.name ?? "-"}</Text>
            <Text>{dc.customer?.address ?? ""}</Text>
            <Text>{dc.customer?.phone ?? ""}</Text>
            {dc.customer?.gst_number && <Text>GST: {dc.customer.gst_number}</Text>}
          </View>
          <View style={styles.box}>
            <Text style={styles.label}>Reference</Text>
            {dc.customer_dc_number && dc.customer_dc_number.length > 0 ? (
              dc.customer_dc_number.map((num, i) => (
                <Text key={i}>
                  Customer DC No: {num || "-"}
                  {dc.customer_dc_date?.[i]
                    ? ` (${new Date(dc.customer_dc_date[i] as string).toLocaleDateString("en-IN")})`
                    : ""}
                </Text>
              ))
            ) : (
              <Text>Customer DC No: -</Text>
            )}
            <Text>Job Order / PO No: {dc.job_order_no ?? "-"}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.label}>Transport</Text>
            <Text>Vehicle No: {dc.vehicle_number ?? "-"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.colComponent]}>Description</Text>
            <Text style={[styles.th, styles.colMaterial]}>Material</Text>
            <Text style={[styles.th, styles.colReceived]}>Received Qty</Text>
            <Text style={[styles.th, styles.colSent]}>Sent Qty</Text>
            <Text style={[styles.th, styles.colMaterialProblem]}>Material Problem</Text>
            <Text style={[styles.th, styles.colRejection]}>Rejection</Text>
            <Text style={[styles.th, styles.colTotal]}>Total</Text>
          </View>
          {dc.items.map((item, i) => (
            <View style={styles.tr} key={i}>
              <Text style={[styles.td, styles.colComponent]}>{item.component}</Text>
              <Text style={[styles.td, styles.colMaterial]}>{item.material ?? ""}</Text>
              <Text style={[styles.td, styles.colReceived]}>{item.received_qty}</Text>
              <Text style={[styles.td, styles.colSent]}>{item.sent_qty}</Text>
              <Text style={[styles.td, styles.colMaterialProblem]}>{item.material_problem_qty}</Text>
              <Text style={[styles.td, styles.colRejection]}>{item.rejection_qty}</Text>
              <Text style={[styles.td, styles.colTotal]}>{item.total_qty}</Text>
            </View>
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <View style={styles.tr} key={`blank-${i}`}>
              <Text style={[styles.td, styles.colComponent]}> </Text>
              <Text style={[styles.td, styles.colMaterial]}> </Text>
              <Text style={[styles.td, styles.colReceived]}> </Text>
              <Text style={[styles.td, styles.colSent]}> </Text>
              <Text style={[styles.td, styles.colMaterialProblem]}> </Text>
              <Text style={[styles.td, styles.colRejection]}> </Text>
              <Text style={[styles.td, styles.colTotal]}> </Text>
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
