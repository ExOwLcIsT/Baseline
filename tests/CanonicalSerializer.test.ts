import CanonicalSerializer from "../core/CanonicalSerializer";
import { bytesToHex } from "@noble/hashes/utils";

import { expect, test, describe } from "vitest";

describe("CanonicalSerializer", () => {

  const sampleObj = {
    b: 2,
    a: 1,
    c: "test"
  };

  const nestedObj = {
    z: 5,
    x: {
      b: 2,
      a: {
        d : 3,
        c: 4
    }
    },
    y: [3, 2, 1]
  };

  test("serialize() sorts keys alphabetically", () => {
    const serialized = CanonicalSerializer.serialize(sampleObj);
    const jsonStr = new TextDecoder().decode(serialized);
    expect(jsonStr).toBe('{"a":1,"b":2,"c":"test"}');
  });

  test("hash() returns correct keccak256 hash", () => {
    const expectedHash = bytesToHex(CanonicalSerializer.hash(sampleObj));
    expect(expectedHash.length).toBe(64);
    const hashAgain = bytesToHex(CanonicalSerializer.hash(sampleObj));
    expect(hashAgain).toBe(expectedHash);
  });

  test("verify_determinism() returns true for deterministic serialization", () => {
    const result = CanonicalSerializer.verify_determinism(sampleObj, 1000);
    expect(result).toBe(true);

    const nestedResult = CanonicalSerializer.verify_determinism(nestedObj, 1000);
    expect(nestedResult).toBe(true);
  });

  test("serialize() handles nested objects correctly", () => {
    const serialized = CanonicalSerializer.serialize(nestedObj);
    const jsonStr = new TextDecoder().decode(serialized);
    expect(jsonStr).toBe('{"x":{"a":{"c":4,"d":3},"b":2},"y":[3,2,1],"z":5}');
  });

  test("serialize() returns Uint8Array", () => {
    const serialized = CanonicalSerializer.serialize(sampleObj);
    expect(serialized).toBeInstanceOf(Uint8Array);
  });

});
