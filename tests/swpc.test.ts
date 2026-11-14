import { describe, expect, it } from "vitest";
import { MISSION_PROFILES } from "@/lib/config";
import { estimateDoseRate, flareClass, sLevelFromFlux } from "@/lib/sources/swpc";

describe("NOAA scales", () => {
  it("maps >=10 MeV proton flux to S-levels", () => {
    expect(sLevelFromFlux(null)).toBe(0);
    expect(sLevelFromFlux(0.3)).toBe(0);
    expect(sLevelFromFlux(10)).toBe(1);
    expect(sLevelFromFlux(250)).toBe(2);
    expect(sLevelFromFlux(1000)).toBe(3);
    expect(sLevelFromFlux(2e5)).toBe(5);
  });

  it("derives flare class from 0.1-0.8 nm flux", () => {
    expect(flareClass(5.6e-7)).toBe("B5.6");
    expect(flareClass(2.3e-5)).toBe("M2.3");
    expect(flareClass(1.2e-4)).toBe("X1.2");
    expect(flareClass(null)).toBeNull();
  });
});

describe("estimateDoseRate", () => {
  it("returns the mission baseline in quiet conditions", () => {
    const r = estimateDoseRate(0.2, MISSION_PROFILES["mars-transit"]);
    expect(r.rate).toBeCloseTo(1.8);
    expect(r.status).toBe("nominal");
  });

  it("attenuates solar particles in LEO compared with deep space", () => {
    const leo = estimateDoseRate(1000, MISSION_PROFILES.iss);
    const deep = estimateDoseRate(1000, MISSION_PROFILES["artemis-lunar"]);
    expect(deep.sepContribution).toBeGreaterThan(leo.sepContribution * 10);
    expect(deep.status).toBe("critical");
  });
});
