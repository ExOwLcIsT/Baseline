import { Address } from "../core/BaseTypes/Address.js";

class Token {
  name: string;
  decimals: bigint;
  address?: Address;
  constructor(name: string, decimals: bigint, address?: Address) {
    this.name = name.toUpperCase();
    this.decimals = decimals;
    this.address = address;
  }

  equals(token0: Token): boolean {
    if (this.name === token0.name && this.decimals === token0.decimals)
      return true;
    return false;
  }
}
export default Token;
