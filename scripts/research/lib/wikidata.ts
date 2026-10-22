// Wikidata reads shared by the link resolver and the facts fetcher: entities in batches of 50,
// single claims (country and language codes), and the value of a claim by its rank.
import type { Fetcher } from "./fetcher";

export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

export const P = {
  imdb: "P345",
  tmdbMovie: "P4947",
  country: "P495",
  title: "P1476",
  language: "P364",
  iso3166alpha2: "P297",
  iso639_1: "P218",
  iso639_3: "P220",
} as const;

type DataValue =
  | { type: "string"; value: string }
  | { type: "wikibase-entityid"; value: { id: string } }
  | { type: "monolingualtext"; value: { text: string; language: string } }
  | { type: string; value: unknown };

export type Claim = {
  mainsnak: { snaktype: string; datavalue?: DataValue };
  rank: "preferred" | "normal" | "deprecated";
};

export type Entity = {
  id: string;
  missing?: string;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<string, Claim[]>;
};

const BATCH = 50;

function url(params: Record<string, string>): string {
  return `${WIKIDATA_API}?${new URLSearchParams({ format: "json", ...params }).toString()}`;
}

/** Values of a claim, preferred rank first, deprecated ones left out. */
export function claimValues(claims: Claim[] | undefined): DataValue[] {
  const usable = (claims ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak.datavalue);
  const preferred = usable.filter((c) => c.rank === "preferred");
  const normal = usable.filter((c) => c.rank === "normal");
  return [...preferred, ...normal].map((c) => c.mainsnak.datavalue as DataValue);
}

export function firstString(entity: Entity, property: string): string | undefined {
  const v = claimValues(entity.claims?.[property]).find((d) => d.type === "string");
  return v ? (v.value as string) : undefined;
}

export function entityIds(entity: Entity, property: string): string[] {
  return claimValues(entity.claims?.[property])
    .filter((d) => d.type === "wikibase-entityid")
    .map((d) => (d.value as { id: string }).id);
}

export function firstMonolingual(entity: Entity, property: string): { text: string; language: string } | undefined {
  const v = claimValues(entity.claims?.[property]).find((d) => d.type === "monolingualtext");
  return v ? (v.value as { text: string; language: string }) : undefined;
}

/** Film entities with their claims, English label and English Wikipedia title. */
export async function getEntities(fetcher: Fetcher, ids: string[]): Promise<Map<string, Entity>> {
  const unique = [...new Set(ids)].sort();
  const found = new Map<string, Entity>();
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const body = await fetcher.getJson<{ entities?: Record<string, Entity> }>(
      url({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "claims|labels|sitelinks",
        languages: "en",
        sitefilter: "enwiki",
      }),
      { label: `wd-entities-${batch[0]}` },
    );
    for (const entity of Object.values(body.entities ?? {})) {
      if (entity.missing === undefined) found.set(entity.id, entity);
    }
  }
  return found;
}

/**
 * The first string value of one property on one entity, such as a country's ISO code.
 * `wbgetclaims` keeps the response small (a country's full entity is megabytes).
 */
export async function getClaimString(fetcher: Fetcher, id: string, property: string): Promise<string | undefined> {
  const body = await fetcher.getJson<{ claims?: Record<string, Claim[]> }>(
    url({ action: "wbgetclaims", entity: id, property }),
    { label: `wd-claim-${id}-${property}` },
  );
  return firstString({ id, claims: body.claims }, property);
}
