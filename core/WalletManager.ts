import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { hexToBytes, randomBytes } from "@noble/hashes/utils";
import util from "node:util";
class WalletManager {
  /*
    Manages wallet operations: key loading, signing, verification.

    Keys can be loaded from:
    - Environment variable
    - Encrypted keyfile (optional stretch goal)
  */
  private readonly privateKey: Uint8Array;
  private readonly publicKey: Uint8Array;

  public static from_env(env_var: string = "privateKey"): WalletManager {
    const key = process.env[env_var];
    if (!key) {
      throw new Error(`${env_var} not found`);
    }

    const wallet = new WalletManager(hexToBytes(key));
    return wallet;
  }

  constructor(key: Uint8Array) {
    this.privateKey = key;
    this.publicKey = getPublicKey(this.privateKey, false);
  }

  public static generate(): WalletManager {
    //     Generate a new random wallet. Returns manager + displays private key ONCE.
    const key = randomBytes(32);
    const wallet = new WalletManager(key);
    return wallet;
  }

  get address(): string {
    ///  Returns checksummed address.

    const pubKeyNoPrefix = this.publicKey.slice(1);
    const hash = keccak_256(pubKeyNoPrefix);
    return "0x" + Buffer.from(hash.slice(-20)).toString("hex");
  }

  // def sign_message(self, message: str) -> SignedMessage:
  //     """Sign an arbitrary message (with EIP-191 prefix)."""
  //     ...

  // def sign_typed_data(self, domain: dict, types: dict, value: dict) -> SignedMessage:
  //     """Sign EIP-712 typed data (used by many DeFi protocols)."""
  //     ...

  // def sign_transaction(self, tx: dict) -> SignedTransaction:
  //     """Sign a transaction dict."""
  //     ...

  toString() {
    return `WalletManager(address=${this.address})`;
  }

  toJSON() {
    return { address: this.address };
  }

  [util.inspect.custom]() {
    return this.toString();
  }
}

export default WalletManager;
