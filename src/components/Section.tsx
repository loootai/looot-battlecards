import type { Section } from "@/engine/types";

const BADGE: Record<Section["status"], { label: string; cls: string }> = {
  ok: { label: "", cls: "" },
  empty: { label: "Nothing found", cls: "bg-low-soft text-low" },
  pending: { label: "Pending at looot", cls: "bg-medium-soft text-medium" },
  failed: { label: "Failed, no charge", cls: "bg-high-soft text-high" },
  skipped: { label: "Skipped", cls: "bg-medium-soft text-medium" },
  not_run: { label: "Not run", cls: "bg-low-soft text-low" },
};

/** One section of a battlecard: its claims, each with a source link and the fetch date. */
export function SectionView({ section }: { section: Section }) {
  const badge = BADGE[section.status];
  return (
    <section className="rounded-panel border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-14 font-semibold">{section.title}</h2>
        {badge.label && <span className={`rounded px-2 py-0.5 text-12 ${badge.cls}`}>{badge.label}</span>}
      </div>
      {section.claims.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {section.claims.map((c, i) => (
            <li key={i} className="text-14">
              {c.text}{" "}
              <span className="text-12 text-mute">
                <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-link underline">source</a>, {c.fetchedAt.slice(0, 10)}, <span className="num">{c.via}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {section.note && <p className="mt-2 text-13 text-mute">{section.note}</p>}
    </section>
  );
}
