


export  class TokenAmount {
  readonly raw: bigint;
  readonly decimals: number;
  readonly symbol?: string;

  private constructor(raw: bigint, decimals: number, symbol?: string) {
    this.raw = raw;
    this.decimals = decimals;
    this.symbol = symbol;

    Object.freeze(this);
  }

  static fromRaw(raw: bigint, decimals: number, symbol?: string): TokenAmount {
    return new TokenAmount(raw, decimals, symbol);
  }

  static fromHuman(
    amount: string | bigint,
    decimals: number,
    symbol?: string
  ): TokenAmount {
    if (typeof amount === "bigint") {
      return new TokenAmount(amount * 10n ** BigInt(decimals), decimals, symbol);
    }

    const [whole, frac = ""] = amount.split(".");

    if (frac.length > decimals) {
      throw new Error("Too many decimal places");
    }

    const padded = frac.padEnd(decimals, "0");

    const raw =
      BigInt(whole) * 10n ** BigInt(decimals) +
      BigInt(padded || "0");

    return new TokenAmount(raw, decimals, symbol);
  }

  get human(): string {
    const base = 10n ** BigInt(this.decimals);

    const whole = this.raw / base;
    const frac = this.raw % base;

    if (frac === 0n) return whole.toString();

    const fracStr = frac
      .toString()
      .padStart(this.decimals, "0")
      .replace(/0+$/, "");

    return `${whole}.${fracStr}`;
  }

  add(other: TokenAmount): TokenAmount {
    this.assertSameDecimals(other);

    return new TokenAmount(
      this.raw + other.raw,
      this.decimals,
      this.symbol
    );
  }

  mul(factor: bigint | number): TokenAmount {
    const f = BigInt(factor);
    return new TokenAmount(this.raw * f, this.decimals, this.symbol);
  }
  private assertSameDecimals(other: TokenAmount) {
    if (this.decimals !== other.decimals) {
      throw new Error("Token decimals mismatch");
    }
  }

  toString(): string {
    return `${this.human} ${this.symbol ?? ""}`.trim();
  }

  toJSON(): string {
    return this.toString();
  }
}

export type TxDict = {
  to: string;
  value: string;
  data: string;

  nonce?: number;
  gasLimit?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  chainId: number;
};