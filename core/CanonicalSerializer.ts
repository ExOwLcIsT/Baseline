import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

class CanonicalSerializer {
  /*
    Produces deterministic JSON for signing.

    Rules:
    - Keys sorted alphabetically (recursive)
    - No whitespace
    - Numbers as-is (but prefer string amounts in trading data)
    - Consistent unicode handling
    */

  static serialize(obj: any): Uint8Array {
  // Внутрішня функція для рекурсивного сортування об'єктів
  function sortObject(value: any): any {
    if (Array.isArray(value)) {
      // Масиви залишаємо як є, але серіалізуємо елементи рекурсивно
      return value.map(sortObject);
    } else if (value !== null && typeof value === "object") {
      const sortedKeys = Object.keys(value).sort();
      const sortedObj: Record<string, any> = {};
      for (const key of sortedKeys) {
        sortedObj[key] = sortObject(value[key]);
      }
      return sortedObj;
    } else {
      // Прості значення повертаємо без змін
      return value;
    }
  }

  const sorted = sortObject(obj);

  const jsonStr = JSON.stringify(sorted); // JSON без пробілів
  return new TextEncoder().encode(jsonStr);
}

  static hash(obj: any): Uint8Array {
    // Returns keccak256 of canonical serialization.
    const serialized = this.serialize(obj);
    const hashed = keccak_256(serialized);
    return hashed;
  }

  static verify_determinism(obj: any, iterations: number = 100): Boolean {
    //Verifies serialization is deterministic over N iterations.
    const hashed = bytesToHex(this.hash(obj));
    for (let i = 0; i < iterations - 1; i++) {
      const hashedOnIteration = bytesToHex(this.hash(obj));
      if (hashed !== hashedOnIteration) {
        return false;
      }
    }
    return true;
  }
}
export default CanonicalSerializer;
