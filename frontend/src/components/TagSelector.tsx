type TagSelectorProps = {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  single?: boolean;
};

export function TagSelector({ tags, selected, onToggle }: TagSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={`rounded-full border px-3 py-1 text-sm transition ${active ? 'bg-[#1A1714] text-[#FAF7F2]' : 'border-[#D5CFC5] text-[#1A1714] hover:border-[#C4673A] hover:text-[#C4673A]'}`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
