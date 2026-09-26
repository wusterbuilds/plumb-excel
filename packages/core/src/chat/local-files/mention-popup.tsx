import { File, FileSpreadsheet, FileText, Grid3X3, Image } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MentionItem } from "./types";

function getItemIcon(item: MentionItem) {
  if (item.category === "Sheets")
    return <Grid3X3 size={12} className="shrink-0 text-(--chat-accent)" />;
  if (item.category === "Named Ranges")
    return (
      <Grid3X3 size={12} className="shrink-0 text-(--chat-text-secondary)" />
    );

  const ext = item.label.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls", "csv", "ods"].includes(ext))
    return (
      <FileSpreadsheet size={12} className="shrink-0 text-(--chat-accent)" />
    );
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return <Image size={12} className="shrink-0 text-(--chat-text-muted)" />;
  if (["md", "txt", "pdf", "doc", "docx"].includes(ext))
    return <FileText size={12} className="shrink-0 text-(--chat-text-muted)" />;
  return <File size={12} className="shrink-0 text-(--chat-text-muted)" />;
}

interface MentionPopupProps {
  items: MentionItem[];
  query: string;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  visible: boolean;
}

export function MentionPopup({
  items,
  query,
  onSelect,
  onClose,
  visible,
}: MentionPopupProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [openAbove, setOpenAbove] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return items;
    const lower = query.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(lower));
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MentionItem[]>();
    for (const item of filtered) {
      const group = map.get(item.category) ?? [];
      group.push(item);
      map.set(item.category, group);
    }
    return map;
  }, [filtered]);

  const flatList = useMemo(() => filtered, [filtered]);

  const prevFilteredRef = useRef(filtered);
  if (prevFilteredRef.current !== filtered) {
    prevFilteredRef.current = filtered;
    if (activeIndex !== 0) setActiveIndex(0);
  }

  useLayoutEffect(() => {
    if (!visible || !listRef.current) return;
    const el = listRef.current;
    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const spaceAbove = parentRect.top;
    const spaceBelow = window.innerHeight - parentRect.bottom;
    const popupHeight = Math.min(el.scrollHeight, 192);
    if (spaceAbove < popupHeight && spaceBelow > spaceAbove) {
      setOpenAbove(false);
    } else {
      setOpenAbove(true);
    }
  }, [visible]);

  const scrollToActive = useCallback(() => {
    requestAnimationFrame(() => {
      const activeEl = listRef.current?.querySelector("[data-active='true']");
      activeEl?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || flatList.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatList.length);
        scrollToActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flatList.length) % flatList.length);
        scrollToActive();
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(flatList[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [visible, flatList, activeIndex, onSelect, onClose, scrollToActive],
  );

  useEffect(() => {
    if (!visible) return undefined;
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, handleKeyDown]);

  if (!visible || flatList.length === 0) return null;

  let flatIndex = 0;

  return (
    <div
      className={`absolute left-0 right-0 max-h-48 overflow-y-auto
                 bg-(--chat-bg) border border-(--chat-border) shadow-lg z-50
                 ${openAbove ? "bottom-full mb-1" : "top-full mt-1"}`}
      style={{
        borderRadius: "var(--chat-radius)",
        fontFamily: "var(--chat-font)",
      }}
      ref={listRef}
    >
      {Array.from(grouped.entries()).map(([category, categoryItems]) => (
        <div key={category}>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-(--chat-text-muted) bg-(--chat-bg-secondary) sticky top-0">
            {category}
          </div>
          {categoryItems.map((item) => {
            const idx = flatIndex++;
            const isActive = idx === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                data-active={isActive}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors
                  ${isActive ? "bg-(--chat-bg-secondary) text-(--chat-text-primary)" : "text-(--chat-text-secondary) hover:bg-(--chat-bg-secondary)"}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
              >
                {getItemIcon(item)}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
