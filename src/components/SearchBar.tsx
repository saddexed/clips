"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchItem = {
  id: string;
  title: string;
  filename: string;
  tags?: { name: string }[];
};

type SearchBarProps = {
  items: SearchItem[];
  onResultsChange: (items: SearchItem[]) => void;
  placeholder?: string;
  tagToAddSignal?: { tag: string; seq: number } | null;
  initialQuery?: string;
  initialTags?: string[];
  onFiltersChange?: (query: string, tags: string[]) => void;
  /** Header variant: pill shell, no max width, tighter height. */
  compact?: boolean;
};

const chipClass = (selected: boolean) =>
  cn(
    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 font-mono text-xs lowercase transition-colors",
    selected ? "bg-solid text-solid-ink hover:opacity-85" : "bg-chip text-chip-ink hover:border-line",
  );

export default function SearchBar({
  items,
  onResultsChange,
  placeholder = "Search by title or tags...",
  tagToAddSignal = null,
  initialQuery = "",
  initialTags = [],
  onFiltersChange,
  compact = false,
}: SearchBarProps) {
  const normalizeTagText = (value: string) =>
    value
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const sanitizeTagInput = (value: string) =>
    normalizeTagText(value).replace(/[^a-z0-9\s-]/g, "");

  const [query, setQuery] = useState(initialQuery);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!onFiltersChange) {
      const savedQuery = sessionStorage.getItem("clipsSearchQuery") || "";
      const savedTags = sessionStorage.getItem("clipsSearchTags");
      if (!initialQuery && !initialTags.length && savedQuery) setQuery(savedQuery);
      if (!initialTags.length && savedTags) {
        try { setSelectedTags(JSON.parse(savedTags)); } catch {}
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    sessionStorage.setItem("clipsSearchQuery", query);
    sessionStorage.setItem("clipsSearchTags", JSON.stringify(selectedTags));
  }, [query, selectedTags, isHydrated]);
  useEffect(() => {
    if (isHydrated) onFiltersChange?.(query, selectedTags);
  }, [query, selectedTags, isHydrated, onFiltersChange]);
  const [maxInlineSuggestions, setMaxInlineSuggestions] = useState(3);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const normalizedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        tags: item.tags || [],
      })),
    [items]
  );

  const normalizedQuery = normalizeTagText(query);

  const suggestedTags = useMemo(() => {
    if (!normalizedQuery) return [];

    const uniqueTags = new Set<string>();
    for (const item of normalizedItems) {
      for (const tag of item.tags) {
        const lowered = normalizeTagText(tag.name);
        if (lowered.includes(normalizedQuery) && !selectedTags.includes(lowered)) {
          uniqueTags.add(lowered);
        }
      }
    }

    return [...uniqueTags].sort((a, b) => a.localeCompare(b)).slice(0, 20);
  }, [normalizedItems, normalizedQuery, selectedTags]);

  const filteredItems = useMemo(() => {
    return normalizedItems.filter((item) => {
      const lowerTitle = (item.title || item.filename || "").toLowerCase();
  const lowerTags = item.tags.map((t) => normalizeTagText(t.name));

      const matchesQuery =
        !normalizedQuery ||
        lowerTitle.includes(normalizedQuery) ||
        lowerTags.some((tag) => tag.includes(normalizedQuery));

      const matchesSelectedTags = selectedTags.every((tag) => lowerTags.includes(tag));

      return matchesQuery && matchesSelectedTags;
    });
  }, [normalizedItems, normalizedQuery, selectedTags]);

  useEffect(() => {
    onResultsChange(filteredItems);
  }, [filteredItems, onResultsChange]);

  const hasActiveFilters = selectedTags.length > 0 || normalizedQuery.length > 0;

  const addTag = (tag: string) => {
    const normalizedTag = sanitizeTagInput(tag);
    if (!normalizedTag) return;
    setSelectedTags((prev) => (prev.includes(normalizedTag) ? prev : [...prev, normalizedTag]));
    setQuery("");
  };

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const clearAll = () => {
    setSelectedTags([]);
    setQuery("");
  };

  useEffect(() => {
    const updateSuggestionCount = () => {
      const width = shellRef.current?.clientWidth || window.innerWidth;
      if (width < 620) {
        setMaxInlineSuggestions(1);
      } else if (width < 860) {
        setMaxInlineSuggestions(2);
      } else {
        setMaxInlineSuggestions(3);
      }
    };

    updateSuggestionCount();
    window.addEventListener("resize", updateSuggestionCount);
    return () => window.removeEventListener("resize", updateSuggestionCount);
  }, []);

  const inlineSuggestedTags = useMemo(
    () => suggestedTags.slice(0, Math.min(3, maxInlineSuggestions)),
    [suggestedTags, maxInlineSuggestions]
  );

  useEffect(() => {
    if (!tagToAddSignal?.tag) return;
    addTag(tagToAddSignal.tag);
  }, [tagToAddSignal?.seq]);

  return (
    <div className={cn("relative w-full", !compact && "max-w-[860px]")}>
      <div
        ref={shellRef}
        className={cn(
          "flex w-full flex-wrap items-center gap-2 border border-line-soft bg-surface transition-colors focus-within:border-line",
          compact
            ? "min-h-9 rounded-full px-3 py-1"
            : "min-h-12 rounded-2xl px-3.5 py-2 shadow-[0_1px_0_var(--line-soft)]",
        )}
      >
        <Search size={16} className="shrink-0 text-muted" />

        {selectedTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => removeTag(tag)}
            className={chipClass(true)}
            title="Remove tag"
            aria-label={`Remove tag ${tag}`}
          >
            <X size={12} />
            {tag}
          </button>
        ))}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Tab" || e.key === "Enter") && normalizedQuery && suggestedTags.length > 0) {
              e.preventDefault();
              addTag(suggestedTags[0]);
              return;
            }

            if ((e.key === "Backspace" || e.key === "Delete") && !query.trim() && selectedTags.length > 0) {
              e.preventDefault();
              setSelectedTags((prev) => prev.slice(0, -1));
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn(
            "min-w-[140px] flex-1 bg-transparent text-ink outline-none placeholder:text-muted focus-visible:outline-none",
            compact ? "h-7 text-sm" : "h-8 text-[0.95rem]",
          )}
        />

        {normalizedQuery && inlineSuggestedTags.length > 0 ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {inlineSuggestedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className={chipClass(false)}
                title="Add tag filter"
              >
                <Tag size={12} />
                {tag}
              </button>
            ))}

            {suggestedTags.length > inlineSuggestedTags.length ? (
              <span className="font-mono text-xs text-muted">
                +{suggestedTags.length - inlineSuggestedTags.length}
              </span>
            ) : null}
          </div>
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            className="ml-1 cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-chip hover:text-chip-ink"
            onClick={clearAll}
          >
            Clear
          </button>
        ) : null}
      </div>

    </div>
  );
}
