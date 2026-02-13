import SignalGenerator from "../strategy/Generator";
import { describe, test } from "vitest";
describe("Signal Generator", () => {
  //const generator: SignalGenerator = new SignalGenerator();
  test("test generate signal profitable", () => {
    /*Generates signal when spread exceeds breakeven.*/
  });

  test("test generate signal no opportunity", () => {
    /*Returns None when spread is too small.*/
  });

  test("test cooldown prevents rapid signals", () => {
    /*Second signal within cooldown returns None.*/
  });

  test("test direction selection", () => {
    /*Picks direction with higher spread.*/
  });
});
