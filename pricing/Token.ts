export class Token {
  name: string;
  decimals: bigint;

  constructor(name: string, decimals: bigint) {
    this.name = name.toUpperCase();
    this.decimals = decimals;
  }

  equals(token0: Token): boolean {
    if (this.name === token0.name && this.decimals === token0.decimals)
      return true;
    return false;
  }
}
