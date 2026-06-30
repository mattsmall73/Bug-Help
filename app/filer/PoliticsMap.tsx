import { SubjectStructure, CountryId } from "@/lib/politicsConfig";
import { FilerResult } from "@/lib/filerPrompt";

type CellState = "primary" | "alt" | null;

// Does a result (or its alternative) land on a given country column + drawer?
// A "comparative" point lights the same drawer in both country columns.
function cellMatches(
  country: CountryId | null,
  drawer: number | null,
  col: "UK" | "USA",
  drawerId: number
): boolean {
  if (drawer !== drawerId) return false;
  if (country === col) return true;
  if (country === "comparative") return true;
  return false;
}

export default function PoliticsMap({
  structure,
  result,
}: {
  structure: SubjectStructure;
  result: FilerResult | null;
}) {
  const r = result;

  function drawerState(col: "UK" | "USA", drawerId: number): CellState {
    if (!r) return null;
    if (cellMatches(r.country, r.drawer, col, drawerId)) return "primary";
    if (r.alternative && cellMatches(r.alternative.country, r.alternative.drawer, col, drawerId))
      return "alt";
    return null;
  }

  const ideasState: CellState = !r
    ? null
    : r.country === "ideas"
    ? "primary"
    : r.alternative?.country === "ideas"
    ? "alt"
    : null;

  const isComparative =
    r?.country === "comparative" || r?.alternative?.country === "comparative";

  return (
    <div className="pmap">
      <div className={`pmap-columns${isComparative ? " comparative" : ""}`}>
        {(["UK", "USA"] as const).map((col) => (
          <div className="pmap-col" key={col}>
            <div className="pmap-col-head">{col}</div>
            {structure.drawers.map((d) => {
              const state = drawerState(col, d.id);
              return (
                <div
                  key={d.id}
                  className={`pmap-cell${state ? " " + state : ""}`}
                >
                  <span className="pmap-cell-num">{d.id}</span>
                  <span className="pmap-cell-name">{d.name}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {isComparative && (
        <div className="pmap-comparative-note">Comparative: a UK-vs-US point</div>
      )}

      <div className={`pmap-ideas${ideasState ? " " + ideasState : ""}`}>
        <div className="pmap-ideas-head">{structure.ideas.label}</div>
        <div className="pmap-ideas-strands">
          {structure.ideas.strands.map((s) => (
            <span className="pmap-strand" key={s.id}>
              {s.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
