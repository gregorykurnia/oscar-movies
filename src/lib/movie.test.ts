import { describe, expect, it } from "vitest";
import { languageName, movieFacts, oscarBoxNote, oscarsHeading, shownOriginalTitle } from "./movie";

describe("movieFacts", () => {
  it("joins year, countries and language", () => {
    expect(movieFacts({ year: 2024, countries: ["BR", "FR"], language: "pt" })).toBe("2024 · Brazil, France · Portuguese");
  });
  it("leaves out what is unknown", () => {
    expect(movieFacts({ year: 2024, countries: [], language: null })).toBe("2024");
  });
});

describe("languageName", () => {
  it("names a code and passes null through", () => {
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName(null)).toBeNull();
  });
});

describe("shownOriginalTitle", () => {
  it("hides an original title that matches", () => {
    expect(shownOriginalTitle("Flow", "flow")).toBeNull();
    expect(shownOriginalTitle("Flow", null)).toBeNull();
    expect(shownOriginalTitle("I'm Still Here", "Ainda Estou Aqui")).toBe("Ainda Estou Aqui");
  });
});

describe("oscarBoxNote", () => {
  it("names the submitting country for International", () => {
    expect(oscarBoxNote({ outcome: "won", country: "BR", listSize: 5 })).toBe("Submitted by Brazil");
  });
  it("counts nominees for a nomination or a win", () => {
    expect(oscarBoxNote({ outcome: "nominated", country: null, listSize: 10 })).toBe("One of 10 nominees");
    expect(oscarBoxNote({ outcome: "won", country: null, listSize: 10 })).toBe("One of 10 nominees");
  });
  it("describes the lists before the nominations", () => {
    expect(oscarBoxNote({ outcome: "shortlisted", country: null, listSize: 15 })).toBe("One of 15 on the shortlist");
    expect(oscarBoxNote({ outcome: "eligible", country: null, listSize: 0 })).toBe("On the eligible list");
    expect(oscarBoxNote({ outcome: "submitted", country: null, listSize: 0 })).toBe("Submitted");
  });
});

describe("oscarsHeading", () => {
  it("names the ceremony and its date", () => {
    expect(oscarsHeading([{ year: 2024, winnersOn: "2025-03-02" }, { year: 2024, winnersOn: "2025-03-02" }])).toBe(
      "97th Academy Awards, 2 Mar 2025",
    );
  });
  it("is empty when the boxes span editions", () => {
    expect(oscarsHeading([{ year: 2023, winnersOn: null }, { year: 2024, winnersOn: null }])).toBeNull();
  });
});
