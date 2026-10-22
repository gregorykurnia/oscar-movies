import type { CSSProperties, ReactNode } from "react";
import { Board, Cell, Spec } from "./parts";

type Swatch = { token: string; label: string; contrast?: string; job: string };

// Each colour has one job (guide §2). Values come from tokens.css; contrast is against paper unless stated.
const GROUPS: Swatch[][] = [
  [
    { token: "paper", label: "paper", job: "Page background" },
    { token: "surface", label: "surface", job: "Top bar, controls, popovers" },
    { token: "track", label: "track", job: "Bar tracks, skeletons, neutral pills, hover" },
    { token: "line", label: "line", job: "Dividers, row rules, control borders" },
    { token: "line-strong", label: "line-strong", job: "Hover borders, group rules" },
  ],
  [
    { token: "ink", label: "ink", contrast: "16.5:1", job: "Text, first-row rule" },
    { token: "ink-muted", label: "muted", contrast: "5.1:1", job: "Secondary text, labels" },
    { token: "ink-subtle", label: "subtle", contrast: "3.4:1", job: "Text 24px and up, icons" },
    { token: "ink-faint", label: "faint", contrast: "2.4:1", job: "Decoration, disabled. Never readable text" },
  ],
  [
    { token: "gold", label: "gold", contrast: "3.1:1", job: "Row lines, bars, stage dot, won cells. Never text" },
    { token: "gold-ink", label: "gold-ink", contrast: "5.2:1", job: "Gold text, leader's %, primary buttons, focus" },
    { token: "gold-ink-hover", label: "gold-ink-hover", job: "Primary hover, press" },
    { token: "gold-soft", label: "gold-soft", job: "Nominated ring, rule on gold wash" },
    { token: "gold-wash", label: "gold-wash", job: "The “why”, active marks, won pill" },
  ],
  [
    { token: "error", label: "error", contrast: "6.5:1 on wash", job: "Failure text and icon only" },
    { token: "error-wash", label: "error-wash", job: "Failure panel" },
    { token: "scrim", label: "scrim", job: "Behind the phone menu and search sheet" },
  ],
];

function Swatches({ tokens }: { tokens: Record<string, string> }) {
  return (
    <>
      {GROUPS.map((group) => (
        <Spec key={group[0].token}>
          {group.map((s) => {
            const value = tokens[`--${s.token}`] ?? "missing";
            // The scrim is ink at 32%: say so instead of printing an rgba.
            const shown = s.token === "scrim" ? "ink at 32%" : value.toUpperCase();
            return (
              <div key={s.token} className="w-[168px]">
                <div
                  aria-hidden="true"
                  className="h-16 rounded-md shadow-flag-edge"
                  style={{ background: `var(--${s.token})` }}
                />
                <p className="mt-2 text-caption font-medium">{s.label}</p>
                <p className="font-sans text-micro text-ink-muted">
                  {shown}
                  {s.contrast ? ` · ${s.contrast}` : ""}
                </p>
                <p className="mt-0.5 text-micro leading-snug text-ink-muted">{s.job}</p>
              </div>
            );
          })}
        </Spec>
      ))}
    </>
  );
}

function TypeRow({ name, spec, children }: { name: string; spec: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-baseline gap-x-5 gap-y-2 border-t border-line py-3.5 md:grid-cols-[200px_1fr]">
      <p className="text-micro leading-snug text-ink-muted">
        <b className="block text-caption font-medium text-ink">{name}</b>
        {spec}
      </p>
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

// Space steps drawn as bars, in the token's own width.
const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 24];

/** Guide §2 and §3 drawn: colour, type, then space, shape and depth (preview §2). */
export function Foundations({ tokens, longWord }: { tokens: Record<string, string>; longWord?: string }) {
  return (
    <>
      <Board id="colour" title="Colour" note="Each colour has one job (guide §2). Contrast is against paper unless stated. Values are read from tokens.css.">
        <Swatches tokens={tokens} />
      </Board>

      <Board id="type" title="Type: Geist, one family" note="Tabular figures everywhere. Big numerals are light (300); headings medium or semibold. Phone sizes after the slash.">
        <div>
          <TypeRow name="Display" spec="52 / 34 · 600 · −0.035em · 1.05">
            <p className="text-display-phone leading-tight font-semibold tracking-display md:text-display">
              {longWord ?? "The 2025 race"}
            </p>
          </TypeRow>
          <TypeRow name="Section" spec="26 / 20 · 500 · −0.02em">
            <p className="text-section-phone font-medium tracking-heading md:text-section">International</p>
          </TypeRow>
          <TypeRow name="Numeral L" spec="34 / 28 · 300 · −0.04em">
            <p className="text-num-l-phone font-light tracking-num md:text-num-l">
              23 <span className="text-[16px] tracking-normal text-ink-muted">of 61</span>
            </p>
          </TypeRow>
          <TypeRow name="Title" spec="21 / 17 · 500 · −0.015em · 1.3">
            <p className="text-title-phone leading-snug font-medium tracking-title md:text-title">One Battle After Another</p>
          </TypeRow>
          <TypeRow name="Body" spec="15 / 14 · 400 · 1.5">
            <p className="text-body-phone md:text-body">Since 2012, six films reached late December with a run like this one.</p>
          </TypeRow>
          <TypeRow name="Small" spec="14 · 400 / 500">
            <p className="text-small">
              <span className="text-ink-muted">Won:</span> Gotham, NBR <span className="text-ink-muted">· Nominated:</span> Golden Globes, Critics Choice, AFI
            </p>
          </TypeRow>
          <TypeRow name="Caption" spec="13 · 400">
            <p className="text-caption text-ink-muted">
              IMDb 7.9 &nbsp; RT 95 &nbsp; MC 95 &nbsp; TMDB 7.5 &nbsp; <span className="font-medium text-ink">86 · 4 of 4</span>
            </p>
          </TypeRow>
          <TypeRow name="Micro" spec="12 · 400 / 500">
            <p className="text-micro text-ink-muted">to be nominated · Updated 20 Dec</p>
          </TypeRow>
        </div>
      </Board>

      <Board
        id="space-shape-depth"
        title="Space, shape, depth"
        note="4px base. Content max 1120px, gutters 32 / 16. Phone is 760px and under; compact is 1100px and under (the search box becomes a button). Depth comes from lines, not shadows; shadows only on things that float."
      >
        <Spec>
          <div className="grid gap-1.5">
            {SPACE_STEPS.map((n) => (
              <div key={n} className="flex items-center gap-3 text-micro text-ink-muted">
                <i
                  aria-hidden="true"
                  className="block h-3 rounded-xs bg-gold-soft"
                  style={{ width: `var(--space-${n})` } as CSSProperties}
                />
                {n} · {n * 4}
              </div>
            ))}
          </div>
        </Spec>
        <Spec>
          <Cell name="radius-sm 6" note="pills, cells">
            <div className="h-16 w-24 rounded-sm border border-line bg-surface" />
          </Cell>
          <Cell name="radius 10" note="controls, panels">
            <div className="h-16 w-24 rounded-md border border-line bg-surface" />
          </Cell>
          <Cell name="radius-lg 14" note="popovers, tiles">
            <div className="h-16 w-24 rounded-lg border border-line bg-surface" />
          </Cell>
          <Cell name="shadow-pop" note="popovers, search">
            <div className="h-16 w-24 rounded-lg bg-surface shadow-pop" />
          </Cell>
          <Cell name="shadow-toast" note="toasts only">
            <div className="h-16 w-24 rounded-md bg-surface shadow-toast" />
          </Cell>
        </Spec>
      </Board>
    </>
  );
}
