export class TokenAmount {
    raw;
    decimals;
    symbol;
    constructor(raw, decimals, symbol) {
        this.raw = raw;
        this.decimals = decimals;
        this.symbol = symbol;
        Object.freeze(this);
    }
    static fromRaw(raw, decimals, symbol) {
        return new TokenAmount(raw, decimals, symbol);
    }
    static fromHuman(amount, decimals, symbol) {
        if (typeof amount === "bigint") {
            return new TokenAmount(amount * 10n ** BigInt(decimals), decimals, symbol);
        }
        const [whole, frac = ""] = amount.split(".");
        if (frac.length > decimals) {
            throw new Error("Too many decimal places");
        }
        const padded = frac.padEnd(decimals, "0");
        const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
        return new TokenAmount(raw, decimals, symbol);
    }
    get human() {
        const base = 10n ** BigInt(this.decimals);
        const whole = this.raw / base;
        const frac = this.raw % base;
        if (frac === 0n)
            return whole.toString();
        const fracStr = frac
            .toString()
            .padStart(this.decimals, "0")
            .replace(/0+$/, "");
        return `${whole}.${fracStr}`;
    }
    add(other) {
        this.assertSameDecimals(other);
        return new TokenAmount(this.raw + other.raw, this.decimals, this.symbol);
    }
    mul(factor) {
        const f = BigInt(factor);
        return new TokenAmount(this.raw * f, this.decimals, this.symbol);
    }
    assertSameDecimals(other) {
        if (this.decimals !== other.decimals) {
            throw new Error("Token decimals mismatch");
        }
    }
    toString() {
        return `${this.human}`;
    }
    toJSON() {
        return this.toString();
    }
}
export default TokenAmount;
