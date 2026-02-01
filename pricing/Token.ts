import { Address } from "../core/BaseTypes/Address.js";

class Token {
  name: string;
  decimals: bigint;
  address: Address;
  constructor(name: string, decimals: bigint, address: Address) {
    this.name = name.toUpperCase();
    this.decimals = decimals;
    this.address = address;
  }

  equals(token0: Token): boolean {
    if (this.address.equals(token0.address)) return true;
    return false;
  }
}
export default Token;
