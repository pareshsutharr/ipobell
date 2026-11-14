import { describe, expect, it } from "@jest/globals";

import { isNotSetUpError, NOT_SPECIFIED, NOT_SPECIFIED_PARAM, paramToState, splitStateCounts, stateLabel, stateToParam, statusBreakdown, type StateCount } from "@/features/ipos/states";

const c = (state: string | null, open: number, upcoming: number, closed: number, listed: number): StateCount => ({ state, open, upcoming, closed, listed, total: open + upcoming + closed + listed });

describe("labels and route parameters", () => {
  it("an empty state is 'Not specified', never a guess", () => {
    expect(stateLabel(null)).toBe(NOT_SPECIFIED);
    expect(stateLabel(undefined)).toBe(NOT_SPECIFIED);
    expect(stateLabel("  ")).toBe(NOT_SPECIFIED);
    expect(stateLabel("Gujarat")).toBe("Gujarat");
  });

  it("round-trips every kind of state name through the route", () => {
    for (const s of ["Gujarat", "Tamil Nadu", "Dadra and Nagar Haveli and Daman and Diu", "Jammu and Kashmir"]) {
      expect(paramToState(stateToParam(s))).toBe(s);
      expect(paramToState(encodeURIComponent(stateToParam(s)))).toBe(s);
    }
    expect(stateToParam(null)).toBe(NOT_SPECIFIED_PARAM);
    expect(paramToState(NOT_SPECIFIED_PARAM)).toBeNull();
    expect(paramToState(undefined)).toBeNull();
    expect(paramToState(["Kerala", "x"])).toBe("Kerala");
    expect(paramToState("100%")).toBe("100%"); // malformed encoding is passed through, not thrown
  });
});

describe("splitStateCounts", () => {
  const rows = [c("Maharashtra", 1, 2, 0, 27), c(null, 2, 1, 0, 17), c("Gujarat", 3, 2, 0, 55), c("Delhi", 0, 0, 0, 30), c("Goa", 0, 0, 0, 0)];

  it("orders states by number of IPOs, then A to Z, and keeps 'Not specified' apart", () => {
    const r = splitStateCounts(rows);
    expect(r.states.map((s) => s.state)).toEqual(["Gujarat", "Delhi", "Maharashtra"]);
    expect(r.notSpecified?.total).toBe(20);
    expect(r.withState).toBe(120);
    expect(r.totalIpos).toBe(140);
  });

  it("copes with nothing entered at all, and with no data", () => {
    const none = splitStateCounts([c(null, 5, 5, 0, 500)]);
    expect(none.states).toEqual([]);
    expect(none.notSpecified?.total).toBe(510);
    expect(none.withState).toBe(0);
    expect(splitStateCounts(undefined)).toEqual({ states: [], notSpecified: null, totalIpos: 0, withState: 0 });
    expect(splitStateCounts([]).totalIpos).toBe(0);
  });

  it("does not mutate its input", () => {
    const input = [c("B", 0, 0, 0, 1), c("A", 0, 0, 0, 2)];
    splitStateCounts(input);
    expect(input.map((r) => r.state)).toEqual(["B", "A"]);
  });
});

describe("statusBreakdown", () => {
  it("lists only non-zero parts, live statuses first", () => {
    expect(statusBreakdown(c("x", 3, 2, 1, 40))).toBe("3 open · 2 upcoming · 1 closed · 40 listed");
    expect(statusBreakdown(c("x", 0, 0, 0, 12))).toBe("12 listed");
    expect(statusBreakdown(c("x", 1, 0, 0, 0))).toBe("1 open");
    expect(statusBreakdown(c("x", 0, 0, 0, 0))).toBe("");
  });
});

describe("isNotSetUpError", () => {
  it("recognises a backend that does not have the view or function yet", () => {
    expect(isNotSetUpError({ code: "PGRST202", message: "Could not find the function public.ipo_state_counts(p_board) in the schema cache" })).toBe(true);
    expect(isNotSetUpError({ code: "PGRST205", message: "Could not find the table 'public.ipo_directory' in the schema cache" })).toBe(true);
    expect(isNotSetUpError({ code: "42P01", message: 'relation "public.ipo_directory" does not exist' })).toBe(true);
  });

  it("does not hide real errors", () => {
    expect(isNotSetUpError(new Error("Network request failed"))).toBe(false);
    expect(isNotSetUpError({ code: "42501", message: "permission denied for table ipos" })).toBe(false);
    expect(isNotSetUpError(null)).toBe(false);
    expect(isNotSetUpError(undefined)).toBe(false);
  });
});
