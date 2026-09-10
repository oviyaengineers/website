import Link from "next/link";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DcRow } from "@/lib/dc-rows";

function shortDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "dd MMM yyyy");
}

/**
 * The item lines, with both sides of the movement on one row.
 *
 * A wide table is unreadable on a phone, so below the small breakpoint each
 * line is stacked as a card instead. Both are rendered and one is hidden, which
 * keeps it working without measuring the viewport in JavaScript.
 */
export function DcRowTable({ rows, showPending }: { rows: DcRow[]; showPending: boolean }) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer DC</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Recd</TableHead>
              <TableHead>Our DC</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Mat. problem</TableHead>
              <TableHead className="text-right">Rejection</TableHead>
              {showPending && <TableHead className="text-right">Pending</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="align-top">
                  <span className="font-medium">{row.customerDcNumbers.join(", ") || "-"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.customerDcDates.map(shortDate).join(", ") || "-"}
                  </span>
                  <span className="block text-xs text-muted-foreground">{row.customerName}</span>
                </TableCell>
                <TableCell className="align-top">
                  {row.component}
                  {row.material ? (
                    <span className="block text-xs text-muted-foreground">{row.material}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{row.received}</TableCell>
                <TableCell className="align-top">
                  <Link
                    href={`/dashboard/dc/${row.dcId}`}
                    className="font-medium text-[#10233f] underline-offset-2 hover:underline dark:text-amber-400"
                  >
                    {row.dcNumber}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {shortDate(row.dcDate)}
                  </span>
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{row.sent}</TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {row.materialProblem}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{row.rejection}</TableCell>
                {showPending && (
                  <TableCell className="text-right align-top font-medium tabular-nums">
                    {row.pending}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{row.component}</p>
            {row.material ? <p className="text-xs text-muted-foreground">{row.material}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {row.customerDcNumbers.join(", ") || "-"} ·{" "}
              {row.customerDcDates.map(shortDate).join(", ") || "-"}
            </p>
            <p className="text-xs text-muted-foreground">{row.customerName}</p>
            <p className="mt-1 text-xs">
              <Link
                href={`/dashboard/dc/${row.dcId}`}
                className="font-medium text-[#10233f] underline-offset-2 hover:underline dark:text-amber-400"
              >
                {row.dcNumber}
              </Link>{" "}
              <span className="text-muted-foreground">· {shortDate(row.dcDate)}</span>
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Figure label="Received" value={row.received} />
              <Figure label="Sent" value={row.sent} />
              <Figure label="Material problem" value={row.materialProblem} />
              <Figure label="Rejection" value={row.rejection} />
              {showPending && <Figure label="Pending" value={row.pending} strong />}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums${strong ? " font-medium" : ""}`}>{value}</dd>
    </div>
  );
}
