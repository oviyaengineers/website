import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GROUP_LABELS, type GlobalHit, type GlobalHitGroup } from "@/lib/global-search";

const ORDER: GlobalHitGroup[] = ["component", "challan", "scan", "customer"];

/**
 * What a global search found, grouped by where it lives.
 *
 * The group tells the operator which part of the app a result belongs to,
 * because the same text can be a component on one screen and a challan on
 * another. Every row is a link to that record and nothing else.
 */
export function GlobalSearchResults({ term, hits }: { term: string; hits: GlobalHit[] }) {
  if (!term.trim()) return null;

  if (term.trim().length < 2) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Type at least two characters to search.
        </CardContent>
      </Card>
    );
  }

  if (hits.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nothing matches &ldquo;{term}&rdquo;. Try part of a DC number, a customer, a component or
          a material.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {ORDER.map((group) => {
        const rows = hits.filter((hit) => hit.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[group]}
            </h2>
            <Card>
              <CardContent className="divide-y p-0">
                {rows.map((hit) => (
                  <Link
                    key={hit.key}
                    href={hit.href}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{hit.title}</span>
                      {hit.detail && (
                        <span className="block text-sm text-muted-foreground">{hit.detail}</span>
                      )}
                    </span>
                    {hit.status && (
                      <Badge variant="outline" className="shrink-0">
                        {hit.status}
                      </Badge>
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
