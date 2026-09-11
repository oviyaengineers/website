import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// The downloaded PDF and the printed sheet are the same document, so this
// mirrors the layout in app/dashboard/dc/[id]/print: one A4 page carrying
// ORIGINAL above DUPLICATE with a cut line between them, every field in its
// own ruled cell, and the same six columns.
//
// They were different documents until now. The PDF printed a single copy,
// seven columns including Material and Received, and unboxed fields, so
// whichever of the two a customer received looked nothing like the other.

const NAVY = "#10233f";
const RULE = "#222222";

const styles = StyleSheet.create({
  page: {
    padding: 22,
    fontSize: 7.5,
    fontFamily: "Helvetica",
    color: "#172033",
  },
  // Each copy takes exactly half the page, whatever it contains, so the cut
  // line always falls at the middle of the sheet.
  copy: { flexGrow: 1, flexBasis: 0, flexDirection: "column" },

  header: {
    backgroundColor: NAVY,
    color: "#ffffff",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 5,
    position: "relative",
  },
  copyLabel: {
    position: "absolute",
    top: 5,
    right: 8,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    borderWidth: 0.5,
    borderColor: "#ffffff",
    borderRadius: 6,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
  },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  headerLine: { fontSize: 6, color: "#dbe3ef", marginTop: 1 },

  block: { borderWidth: 0.6, borderColor: RULE, padding: 4, marginBottom: 5 },
  title: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: NAVY,
    marginBottom: 4,
  },

  // The grid draws its top and left edges, each cell its right and bottom, so
  // adjacent rules meet as one line instead of doubling.
  fields: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: RULE,
  },
  cell: {
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: RULE,
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  cellLabel: {
    fontSize: 5.2,
    fontFamily: "Helvetica-Bold",
    color: "#5b6472",
    marginBottom: 1,
  },
  cellValue: { fontSize: 7 },

  table: { borderWidth: 0.5, borderColor: RULE, marginBottom: 5 },
  tr: { flexDirection: "row" },
  caption: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    backgroundColor: "#eef2f7",
    textAlign: "center",
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderColor: RULE,
  },
  th: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#eef2f7",
    textAlign: "center",
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: RULE,
  },
  td: {
    fontSize: 6.5,
    textAlign: "center",
    paddingVertical: 2.5,
    paddingHorizontal: 2,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: RULE,
  },
  // Matches the colgroup on the printed sheet.
  colNo: { width: "8%" },
  colDescription: { width: "44%" },
  colQty: { width: "11%" },
  colProblem: { width: "13%" },
  colRejection: { width: "12%" },
  colTotal: { width: "12%" },

  // Pushes the note and signatures to the foot of each half.
  foot: { marginTop: "auto" },
  signCell: { minHeight: 34 },

  cut: {
    borderTopWidth: 0.5,
    borderTopColor: "#9aa3b0",
    borderStyle: "dashed",
    textAlign: "center",
    fontSize: 5.5,
    color: "#9aa3b0",
    paddingTop: 2,
    marginVertical: 4,
  },
});

export type DcPdfData = {
  dc_number: string;
  dc_date: string;
  customer_dc_number: string[] | null;
  customer_dc_date: (string | null)[] | null;
  authorized_by: string | null;
  customer: {
    name: string;
    address: string | null;
    phone: string | null;
    gst_number: string | null;
  } | null;
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

/** Rows the table is padded to, so a short challan keeps the same shape. */
const MIN_TABLE_ROWS = 4;

function inIndia(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** One ruled cell: a small caption above its value. */
function Field({
  label,
  width,
  minHeight,
  children,
}: {
  label: string;
  width: string;
  minHeight?: number;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.cell, { width }, minHeight ? { minHeight } : {}]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={styles.cellValue}>{children}</View>
    </View>
  );
}

function DcCopy({ label, dc }: { label: string; dc: DcPdfData }) {
  const refs = dc.customer_dc_number?.filter(Boolean) ?? [];
  const blanks = Math.max(0, MIN_TABLE_ROWS - dc.items.length);

  return (
    <View style={styles.copy}>
      <View style={styles.header}>
        <Text style={styles.copyLabel}>{label}</Text>
        {/* react-pdf's Image, not an HTML img: it takes no alt, and a PDF has
            nowhere to put one. The rule cannot tell the two apart. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src="/logo.png" style={{ width: 34, height: 22, marginBottom: 2 }} />
        <Text style={styles.companyName}>OVIYA ENGINEERS</Text>
        <Text style={styles.headerLine}>
          40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
        </Text>
        <Text style={styles.headerLine}>Ph: 9965902970, 9965702970</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.title}>Delivery Challan</Text>
        <View style={styles.fields}>
          <Field label="Our DC Number" width="25%">
            <Text>{dc.dc_number}</Text>
          </Field>
          <Field label="Date" width="25%">
            <Text>{inIndia(dc.dc_date)}</Text>
          </Field>
          <Field label="Customer DC Number(s)" width="50%">
            {refs.length > 0 ? (
              refs.map((num, i) => (
                <Text key={i}>
                  {num}
                  {dc.customer_dc_date?.[i]
                    ? ` (${inIndia(dc.customer_dc_date[i] as string)})`
                    : ""}
                </Text>
              ))
            ) : (
              <Text>-</Text>
            )}
          </Field>
          <Field label="Customer Name" width="50%">
            <Text>{dc.customer?.name ?? "-"}</Text>
            {dc.customer?.address ? <Text>{dc.customer.address}</Text> : null}
          </Field>
          <Field label="Contact / GST" width="50%">
            {dc.customer?.phone ? <Text>{dc.customer.phone}</Text> : null}
            {dc.customer?.gst_number ? <Text>GST: {dc.customer.gst_number}</Text> : null}
            {!dc.customer?.phone && !dc.customer?.gst_number ? <Text>-</Text> : null}
          </Field>
        </View>
      </View>

      <View style={styles.table}>
        <Text style={styles.caption}>Material / Component Details</Text>
        <View style={styles.tr}>
          <Text style={[styles.th, styles.colNo]}>S.No.</Text>
          <Text style={[styles.th, styles.colDescription]}>Description</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
          <Text style={[styles.th, styles.colProblem]}>Mat. Problem</Text>
          <Text style={[styles.th, styles.colRejection]}>Rejection</Text>
          <Text style={[styles.th, styles.colTotal]}>Total</Text>
        </View>
        {dc.items.map((item, i) => (
          <View style={styles.tr} key={i}>
            <Text style={[styles.td, styles.colNo]}>{i + 1}</Text>
            <Text style={[styles.td, styles.colDescription]}>{item.component}</Text>
            {/* The Qty column on a challan is what went out, not what came in. */}
            <Text style={[styles.td, styles.colQty]}>{item.sent_qty}</Text>
            <Text style={[styles.td, styles.colProblem]}>{item.material_problem_qty}</Text>
            <Text style={[styles.td, styles.colRejection]}>{item.rejection_qty}</Text>
            <Text style={[styles.td, styles.colTotal]}>{item.total_qty}</Text>
          </View>
        ))}
        {Array.from({ length: blanks }).map((_, i) => (
          <View style={styles.tr} key={`blank-${i}`}>
            <Text style={[styles.td, styles.colNo]}> </Text>
            <Text style={[styles.td, styles.colDescription]}> </Text>
            <Text style={[styles.td, styles.colQty]}> </Text>
            <Text style={[styles.td, styles.colProblem]}> </Text>
            <Text style={[styles.td, styles.colRejection]}> </Text>
            <Text style={[styles.td, styles.colTotal]}> </Text>
          </View>
        ))}
      </View>

      <View style={[styles.block, styles.foot, { marginBottom: 0 }]}>
        <View style={styles.fields}>
          <Field label="Note" width="100%">
            <Text>Sent after machining</Text>
          </Field>
          <Field label="Receiver's Signature" width="50%" minHeight={styles.signCell.minHeight} />
          <Field
            label={dc.authorized_by ? "Authorized By" : "Authorized Signatory"}
            width="50%"
            minHeight={styles.signCell.minHeight}
          >
            {dc.authorized_by ? <Text>{dc.authorized_by}</Text> : null}
          </Field>
        </View>
      </View>
    </View>
  );
}

export function DcPdfDocument({ dc }: { dc: DcPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DcCopy label="ORIGINAL" dc={dc} />
        <Text style={styles.cut}>cut here</Text>
        <DcCopy label="DUPLICATE" dc={dc} />
      </Page>
    </Document>
  );
}
