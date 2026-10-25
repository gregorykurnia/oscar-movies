// The "Country" / "Countries" line of a Wikipedia film infobox, read from the page's wikitext
// (task 7.2). Pure: the script feeds it pages and takes the names back in the order the
// article lists them. Footnotes, comments and flag icons are stripped; links, plain text,
// lists and flag templates all give names.

const COUNTRY_PARAMS = new Set(["country", "countries"]);

/** The text inside the first `{{Infobox …}}` of a page, up to its closing braces; null when there is none. */
export function infoboxSource(wikitext: string): string | null {
  const start = wikitext.search(/\{\{\s*infobox\b/i);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < wikitext.length - 1; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === "{{") {
      depth++;
      i++;
    } else if (two === "}}") {
      depth--;
      i++;
      if (depth === 0) return wikitext.slice(start + 2, i - 1);
    }
  }
  return null;
}

/** Splits template text at the `|` that sit outside nested templates and links. */
function topLevelParts(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      i++;
    } else if (two === "}}" || two === "]]") {
      depth--;
      i++;
    } else if (body[i] === "|" && depth === 0) {
      parts.push(body.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(body.slice(from));
  return parts;
}

/** The raw value of the infobox's country parameter, or null when it has none or it is empty. */
export function countryParam(wikitext: string): string | null {
  const body = infoboxSource(wikitext);
  if (body === null) return null;
  for (const part of topLevelParts(body).slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (!COUNTRY_PARAMS.has(part.slice(0, eq).trim().toLowerCase())) continue;
    const value = part.slice(eq + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

/** Removes a template (with its nested ones) whose name starts like `names`, wherever it sits. */
function dropTemplates(text: string, names: RegExp): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("{{", i) && names.test(text.slice(i + 2, i + 40))) {
      let depth = 0;
      let j = i;
      for (; j < text.length - 1; j++) {
        if (text.startsWith("{{", j)) {
          depth++;
          j++;
        } else if (text.startsWith("}}", j)) {
          depth--;
          j++;
          if (depth === 0) break;
        }
      }
      i = j;
    } else {
      out += text[i];
    }
  }
  return out;
}

const FOOTNOTE_TEMPLATES = /^\s*(efn|sfn|harv|refn|cite|citation|cn|citation needed|clarify|when|which|who|note)\b/i;
// The flag templates whose output includes the country's name.
const FLAG_NAME = /\{\{\s*(?:flag|flagcountry|flagu|flagdeco)\s*\|\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}/gi;
const FLAG_ICON = /\{\{\s*(?:flagicon|flagicon image|flag icon)\s*\|[^}]*\}\}/gi;

/**
 * The country names of an infobox value, in order. Handles a bulleted or `<br>`-separated
 * list, `{{plainlist}}`/`{{ubl}}`, comma- or slash-separated plain text, links (`[[A|B]]` is A),
 * and flag templates; drops footnotes and comments.
 */
export function countryNames(raw: string): string[] {
  let text = raw.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<ref\b[^>]*\/>/gi, "").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  text = dropTemplates(text, FOOTNOTE_TEMPLATES);
  text = text.replace(/\[\d+\]|\[[a-z]\]/gi, "");
  text = text.replace(FLAG_ICON, "");
  // A flag template that names the country stands for it ("{{flag|France}}" shows "France").
  text = text.replace(FLAG_NAME, (_, name: string) => `[[${name}]]`);
  // Link targets, then the other templates' own separators.
  text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, "$1");
  text = text.replace(/\{\{\s*(?:plainlist|plain list|ublist|ubl|ulist|unbulleted list|flatlist|flat list|hlist|bulleted list|blist|nowrap)\b\s*\|?/gi, "\n");
  text = text.replace(/\{\{[^{}]*\}\}/g, " ").replace(/\{\{|\}\}/g, " ");
  text = text.replace(/<br\s*\/?>|<\/?(?:small|span|div|nowiki)[^>]*>/gi, "\n").replace(/'{2,}/g, "");
  const names: string[] = [];
  for (const piece of text.split(/\n|\||·|•|;|\/|,|\s+&\s+|(?<!Bosnia|Trinidad|Antigua|Kitts|Príncipe|Principe|Tome)\s+and\s+(?=[A-Z])/)) {
    const name = piece.replace(/^[\s*#:]+/, "").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The first country the page's infobox lists, or null when the page has no infobox country. */
export function primaryCountryName(wikitext: string): string | null {
  const raw = countryParam(wikitext);
  if (raw === null) return null;
  return countryNames(raw)[0] ?? null;
}
