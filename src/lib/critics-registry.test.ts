import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AwardsFile } from "./data-files";

const registry = JSON.parse(readFileSync("data/awards.json", "utf8")) as AwardsFile;
const critics = registry.filter((a) => a.kind === "critics");

// Product plan §3.1's 62 critics groups, in its order, with the registry slugs that hold them
// (identities from product plan §10). Critics Choice has two: its Documentary Awards run on
// their own dates in November.
const GROUPS: [string, string[]][] = [
  ["African American", ["african-american-critics"]],
  ["Alliance of Women", ["women-film-journalists"]],
  ["Atlanta", ["atlanta-critics"]],
  ["Austin", ["austin-critics"]],
  ["Black", ["black-critics"]],
  ["Boston Online", ["boston-online"]],
  ["Boston Society", ["boston-society"]],
  ["British Independent", ["british-independent"]],
  ["Central Florida", ["central-florida-critics"]],
  ["Chicago FCA", ["chicago-critics"]],
  ["Chicago IC", ["chicago-indie-critics"]],
  ["Columbus", ["columbus-critics"]],
  ["Critics Choice", ["critics-choice", "critics-choice-documentary"]],
  ["Dallas Fort Worth", ["dallas-fort-worth-critics"]],
  ["Florida", ["florida-critics"]],
  ["Georgia", ["georgia-critics"]],
  ["Gotham", ["gotham"]],
  ["Greater Western New York", ["greater-western-new-york-critics"]],
  ["Hawaii", ["hawaii-critics"]],
  ["Hollywood", ["hollywood-critics"]],
  ["Houston", ["houston-critics"]],
  ["Indiana", ["indiana-critics"]],
  ["International Cinephile Society", ["international-cinephile-society"]],
  ["International Documentary Association", ["ida"]],
  ["Iowa", ["iowa-critics"]],
  ["Kansas City", ["kansas-city-critics"]],
  ["Las Vegas", ["las-vegas-critics"]],
  ["Latino Entertainment", ["latino-entertainment-journalists"]],
  ["London", ["london-critics"]],
  ["Los Angeles", ["los-angeles-critics"]],
  ["Michigan", ["michigan-critics"]],
  ["Minnesota", ["minnesota-critics"]],
  ["Music City", ["music-city-critics"]],
  ["National Society", ["national-society"]],
  ["NBR", ["nbr"]],
  ["New Jersey", ["new-jersey-critics"]],
  ["New York Circle", ["new-york-critics"]],
  ["New York Online", ["new-york-online"]],
  ["North Carolina", ["north-carolina-critics"]],
  ["North Dakota", ["north-dakota-critics"]],
  ["North Texas", ["north-texas-critics"]],
  ["Oklahoma", ["oklahoma-critics"]],
  ["Online FCS", ["online-critics"]],
  ["Online Female", ["online-female-critics"]],
  ["Online FTV", ["online-ftv"]],
  ["Peabody", ["peabody"]],
  ["Philadelphia", ["philadelphia-critics"]],
  ["Phoenix CC", ["phoenix-critics-circle"]],
  ["Phoenix FCS", ["phoenix-critics-society"]],
  ["Pittsburgh", ["pittsburgh-critics"]],
  ["Portland", ["portland-critics"]],
  ["Puerto Rico", ["puerto-rico-critics"]],
  ["San Diego", ["san-diego-critics"]],
  ["San Francisco Bay Area", ["san-francisco-critics"]],
  ["Seattle", ["seattle-critics"]],
  ["Society of LGBTQ", ["lgbtq-critics"]],
  ["Southeastern", ["southeastern-critics"]],
  ["St. Louis", ["st-louis-critics"]],
  ["Toronto", ["toronto-critics"]],
  ["Utah", ["utah-critics"]],
  ["Vancouver", ["vancouver-critics"]],
  ["Washington DC", ["washington-dc-critics"]],
];

describe("critics registry (data/awards.json)", () => {
  it("holds every group in product plan §3.1 and nothing else", () => {
    expect(GROUPS).toHaveLength(62);
    expect(critics.map((a) => a.slug).sort()).toEqual(GROUPS.flatMap(([, slugs]) => slugs).sort());
  });

  it("gives each group its own calendar place", () => {
    const orders = critics.map((a) => a.calendarOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("maps Critics Choice Documentary and IDA with their Director and Political categories", () => {
    const categories = (slug: string) => registry.find((a) => a.slug === slug)?.categories ?? [];
    expect(categories("critics-choice-documentary").map((c) => [c.slug, c.oscarCategory, c.loose ?? false])).toEqual([
      ["feature", "documentary", false],
      ["director", "documentary", true],
      ["political", "documentary", false],
    ]);
    expect(categories("ida").map((c) => [c.slug, c.oscarCategory, c.loose ?? false])).toEqual([
      ["feature", "documentary", false],
      ["director", "documentary", true],
    ]);
  });

  it("explains every loose mapping", () => {
    for (const c of critics.flatMap((a) => a.categories)) expect(c.loose === true).toBe(c.mappingNote !== undefined);
  });
});
