import { redirect } from "next/navigation";

/**
 * The earlier "Print together" link. Combined printing now lives at Combined
 * DC Print, which checks the selection the same way; old links go there.
 */
export default async function PrintTogetherRedirect({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  redirect(`/dashboard/dc/combined-print/print${ids ? `?ids=${encodeURIComponent(ids)}` : ""}`);
}
