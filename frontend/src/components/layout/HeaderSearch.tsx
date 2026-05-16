import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/lib/encryption-provider";
import { useDecrypted } from "@/lib/use-decrypted";
import {
  decryptOptionalArray,
  decryptOptionalText,
  decryptText,
} from "@/lib/encrypted-fields";

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 20;

interface Props {
  className?: string;
}

interface SearchableAsset {
  _id: string;
  name: string;
  description?: string;
  tags?: string[];
  haystack: string;
}

export function HeaderSearch({ className }: Props) {
  const { dek } = useEncryption();
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const listboxId = useId();
  const optionId = (assetId: string) => `${listboxId}-${assetId}`;

  // Subscribe to the whole asset list — there's no server-side search anymore
  // because ciphertext can't be indexed. We decrypt names/descriptions/tags
  // once and filter in memory.
  const assets = useQuery(api.assets.listAllAssets);

  const decrypted = useDecrypted(
    assets,
    dek,
    async (list, dek): Promise<SearchableAsset[]> =>
      Promise.all(
        list.map(async (a) => {
          const name = await decryptText(a.name, dek);
          const description = await decryptOptionalText(a.description, dek);
          const tags = await decryptOptionalArray(a.tags, dek);
          const haystack = [name, description ?? "", ...(tags ?? [])]
            .join(" ")
            .toLowerCase();
          return { _id: a._id, name, description, tags, haystack };
        })
      )
  );

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(input.trim().toLowerCase());
      setFocusedIndex(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const list = useMemo(() => {
    if (!debounced || !decrypted) return [];
    return decrypted
      .filter((a) => a.haystack.includes(debounced))
      .slice(0, MAX_RESULTS);
  }, [debounced, decrypted]);

  function dismiss() {
    setOpen(false);
    setInput("");
    setDebounced("");
    inputRef.current?.blur();
  }

  function go(asset: SearchableAsset) {
    dismiss();
    navigate(`/assets/${asset._id}`);
  }

  const showPopover = open && debounced.length > 0;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return;
    }
    if (!showPopover || list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i - 1 + list.length) % list.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = list[focusedIndex];
      if (target) go(target);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search assets…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label="Search assets"
        aria-autocomplete="list"
        aria-expanded={showPopover}
        aria-controls={listboxId}
        aria-activedescendant={
          showPopover && list.length > 0
            ? optionId(list[focusedIndex]._id)
            : undefined
        }
        className="h-8 pl-8 text-sm"
      />
      {showPopover && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {decrypted === undefined ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Searching…
            </p>
          ) : list.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No matches for &ldquo;{debounced}&rdquo;.
            </p>
          ) : (
            list.map((asset, i) => {
              const active = i === focusedIndex;
              return (
                <Link
                  key={asset._id}
                  id={optionId(asset._id)}
                  to={`/assets/${asset._id}`}
                  role="option"
                  aria-selected={active}
                  onClick={dismiss}
                  onMouseEnter={() => setFocusedIndex(i)}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-sm px-2 py-1.5 text-sm no-underline text-inherit",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <span className="font-medium leading-tight">
                    {asset.name}
                  </span>
                  {asset.description && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {asset.description}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
