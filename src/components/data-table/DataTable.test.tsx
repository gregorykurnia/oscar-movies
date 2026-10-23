// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataFigure, DataName, DataTable, type DataColumn, type DataRow } from "./DataTable";

const columns: DataColumn[] = [
  { key: "award", label: "Award" },
  { key: "won", label: "Winner won the Oscar", sortable: true },
  { key: "nominated", label: "Winner nominated", sortable: true },
  { key: "years", label: "Years", sortable: true, hidePhone: true },
];

const rows: DataRow[] = [
  { type: "group", key: "majors", label: "Major awards" },
  {
    key: "pga",
    cells: [<DataName key="n" name="PGA" note="Theatrical Motion Picture" />, <DataFigure key="w" pct={78.6} count="11 of 14" meter />, <DataFigure key="o" pct={100} count="14 of 14" />, "14"],
  },
  {
    key: "afi",
    cells: [<DataName key="n" name="AFI Top 10" note="A list, no winner" />, <DataFigure key="w" pct={null} reason="AFI's list has no winner" />, <DataFigure key="o" pct={null} />, "14"],
  },
];

describe("DataTable", () => {
  it("heads over an ink rule; group rows on a line-strong rule; figures right-aligned", () => {
    render(<DataTable columns={columns} rows={rows} caption="Accuracy for Best Picture" />);
    const table = screen.getByRole("table", { name: "Accuracy for Best Picture" });
    const heads = within(table.querySelector("thead")!).getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual(["Award", "Winner won the Oscar", "Winner nominated", "Years"]);
    expect(heads[0].className).toContain("border-ink");
    expect(heads[1].className).toContain("text-right");
    expect(heads[3].className).toContain("max-md:hidden");
    const group = within(table).getByRole("columnheader", { name: "Major awards" });
    expect(group.getAttribute("colspan")).toBe("4");
    expect(group.className).toContain("border-line-strong");
    // No onSort: the heads are plain text.
    expect(within(table).queryByRole("button")).toBeNull();
  });

  it("figures: % in 500 then the count, mini meter under the main one, – where it doesn't apply", () => {
    render(<DataTable columns={columns} rows={rows} />);
    const cell = screen.getByText("79%").closest("td") as HTMLElement;
    expect(cell.className).toContain("text-right");
    expect(cell.textContent).toBe("79% 11 of 14");
    expect((cell.querySelector('[aria-hidden="true"] > span') as HTMLElement).style.width).toBe("79%");
    const dash = screen.getByTitle("AFI's list has no winner");
    expect(dash.textContent).toBe("–");
    expect(screen.getByText("Theatrical Motion Picture").className).toContain("text-ink-muted");
  });

  it("sortable heads are buttons; the sorted one is ink 500 with an arrow and aria-sort", () => {
    const onSort = vi.fn();
    render(<DataTable columns={columns} rows={rows} sort={{ key: "won", direction: "descending" }} onSort={onSort} />);
    const won = screen.getByRole("button", { name: "Winner won the Oscar" });
    expect(won.className).toContain("font-medium");
    expect(won.querySelector("svg")).not.toBeNull();
    expect(won.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    const nominated = screen.getByRole("button", { name: "Winner nominated" });
    expect(nominated.closest("th")?.hasAttribute("aria-sort")).toBe(false);
    expect(nominated.querySelector("svg")).toBeNull();

    fireEvent.click(won);
    expect(onSort).toHaveBeenLastCalledWith({ key: "won", direction: "ascending" });
    fireEvent.click(nominated);
    expect(onSort).toHaveBeenLastCalledWith({ key: "nominated", direction: "descending" });
  });

  it("a column with a firstDirection starts that way, then flips like the rest", () => {
    const onSort = vi.fn();
    const named: DataColumn[] = [{ key: "award", label: "Award", sortable: true, firstDirection: "ascending" }, ...columns.slice(1)];
    const { rerender } = render(<DataTable columns={named} rows={rows} sort={{ key: "won", direction: "descending" }} onSort={onSort} />);
    fireEvent.click(screen.getByRole("button", { name: "Award" }));
    expect(onSort).toHaveBeenLastCalledWith({ key: "award", direction: "ascending" });
    rerender(<DataTable columns={named} rows={rows} sort={{ key: "award", direction: "ascending" }} onSort={onSort} />);
    fireEvent.click(screen.getByRole("button", { name: "Award" }));
    expect(onSort).toHaveBeenLastCalledWith({ key: "award", direction: "descending" });
  });
});
