import { keccak_256 } from "@noble/hashes/sha3";
const HEX_REGEX = /^0x[0-9a-fA-F]{40}$/;
export class Address {
    value;
    constructor(value) {
        this.value = value.toLowerCase();
    }
    static fromString(s) {
        if (!HEX_REGEX.test(s)) {
            throw new Error("Invalid Ethereum address");
        }
        return new Address(s);
    }
    // EIP-55 checksum
    get checksum() {
        const addr = this.value.slice(2).toLowerCase();
        const hash = Buffer.from(keccak_256(addr)).toString("hex");
        let out = "0x";
        for (let i = 0; i < addr.length; i++) {
            out += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
        }
        return out;
    }
    get lower() {
        return this.value;
    }
    equals(other) {
        if (other instanceof Address) {
            return this.value === other.value;
        }
        if (typeof other === "string") {
            return this.value === other.toLowerCase();
        }
        return false;
    }
    toString() {
        return this.checksum;
    }
    toJSON() {
        return this.checksum;
    }
}
