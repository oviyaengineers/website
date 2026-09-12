"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Wait this long after the last keystroke before searching. */
const DEBOUNCE_MS = 350;

/**
 * The search box used on every list.
 *
 * The term lives in the URL, so a search survives a refresh, can be
 * bookmarked, sent to somebody, and sits alongside whatever filters the page
 * already has rather than fighting them. Typing is debounced because each
 * change re-runs a server query.
 */
export function SearchBox({
  placeholder,
  param = "q",
  className = "w-full sm:w-80",
}: {
  placeholder: string;
  /** The query-string key, so a page can carry more than one search. */
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get(param) ?? "";
  const [value, setValue] = useState(fromUrl);
  const typing = useRef(false);

  // The URL can change without this box being touched — the Clear button on a
  // filter bar, or the back button. Follow it, unless the operator is mid-word.
  useEffect(() => {
    if (!typing.current) setValue(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (value === fromUrl) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(param, value);
      else next.delete(param);
      typing.current = false;
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // params is a new object on every render; its string form is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fromUrl, param, pathname, router, params.toString()]);

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8 pr-9"
        onChange={(e) => {
          typing.current = true;
          setValue(e.target.value);
        }}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          className="absolute right-0.5 top-0.5 h-8 w-8 text-muted-foreground"
          onClick={() => {
            typing.current = true;
            setValue("");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
