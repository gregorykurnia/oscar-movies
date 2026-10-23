/** A page section's heading with its muted note on the right (the watch list's and the grid's pattern). */
export function SectionHeading({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section">
        {title}
      </h2>
      {note ? <span className="text-small text-ink-muted">{note}</span> : null}
    </div>
  );
}
