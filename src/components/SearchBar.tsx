"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Tag, X } from "lucide-react";

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
};

export default function SearchBar({
  items,
  onResultsChange,
  placeholder = "Search by title or tags...",
  tagToAddSignal = null,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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

  const normalizedQuery = query.trim().toLowerCase();

  const suggestedTags = useMemo(() => {
    if (!normalizedQuery) return [];

    const uniqueTags = new Set<string>();
    for (const item of normalizedItems) {
      for (const tag of item.tags) {
        const lowered = tag.name.toLowerCase();
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
      const lowerTags = item.tags.map((t) => t.name.toLowerCase());

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
    const normalizedTag = tag.trim().toLowerCase();
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
    <div style={{ position: "relative", width: "100%", maxWidth: "860px" }}>
  <div ref={shellRef} className="search-inline-shell">
        <Search size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />

        {selectedTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => removeTag(tag)}
            className="search-tag-chip search-tag-chip--selected"
            title="Remove tag"
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
          className="search-inline-input"
        />

        {normalizedQuery && inlineSuggestedTags.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {inlineSuggestedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="search-tag-chip"
                title="Add tag filter"
              >
                <Tag size={12} />
                {tag}
              </button>
            ))}

            {suggestedTags.length > inlineSuggestedTags.length ? (
              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontWeight: 600 }}>
                +{suggestedTags.length - inlineSuggestedTags.length}
              </span>
            ) : null}
          </div>
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", marginLeft: "0.4rem" }}
            onClick={clearAll}
          >
            Clear
          </button>
        ) : null}
      </div>

    </div>
  );
}
