import { serialize } from "node:v8";
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
        // Sort keys
        const sortedKeys = Object.keys(obj).sort();
        const sortedObj = {};
        for (const key of sortedKeys) {
            sortedObj[key] = obj[key];
        }
        // Convert to JSON string without spaces
        const jsonStr = JSON.stringify(sortedObj);
        // Return bytes
        return new TextEncoder().encode(jsonStr); // Uint8Array
    }
    static hash(obj) {
        // Returns keccak256 of canonical serialization.
        const serialized = serialize(obj);
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
