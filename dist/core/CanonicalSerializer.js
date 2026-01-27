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
    static serialize(obj) {
        function sortObject(value) {
            if (Array.isArray(value)) {
                return value.map(sortObject);
            }
            else if (value !== null && typeof value === "object") {
                const sortedKeys = Object.keys(value).sort();
                const sortedObj = {};
                for (const key of sortedKeys) {
                    sortedObj[key] = sortObject(value[key]);
                }
                return sortedObj;
            }
            else {
                return value;
            }
        }
        const sorted = sortObject(obj);
        const jsonStr = JSON.stringify(sorted);
        return new TextEncoder().encode(jsonStr);
    }
    static hash(obj) {
        const serialized = this.serialize(obj);
        const hashed = keccak_256(serialized);
        return hashed;
    }
    static verify_determinism(obj, iterations = 100) {
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
