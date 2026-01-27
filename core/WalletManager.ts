import { keccak_256 } from "@noble/hashes/sha3";
import {
  bytesToHex,
  hexToBytes,
  randomBytes,
} from "@noble/hashes/utils";
import * as util from "node:util";
import { Address } from "./BaseTypes/Address.js";
import {
  Transaction,
  TypedDataField,
  Wallet,
  verifyMessage,
  verifyTypedData,
} from "ethers";
import { TypedDataDomain } from "ethers";
import { CustomTransactionRequest } from "../core/BaseTypes/TransactionRequest.js";
class WalletManager {
  /*
    Manages wallet operations: key loading, signing, verification.

    Keys can be loaded from:
    - Environment variable
    - Encrypted keyfile (optional stretch goal)
  */

  private readonly wallet: Wallet;
  public static fromEnv(env_var: string = "PRIVATE_KEY"): WalletManager {
    const key = process.env[env_var];
    if (!key) {
      throw new Error(`${env_var} not found`);
    }
    const wallet = new Wallet(key);
    const walletManager = new WalletManager(wallet);
    return walletManager;
  }

  constructor(wallet: Wallet) {
    this.wallet = wallet;
  }

  public static generate(): WalletManager {
    //     Generate a new random wallet. Returns manager + displays private key ONCE.
    const key = randomBytes(32);
    const hex_key = bytesToHex(key);
    console.log("Private key: " + hex_key);
    const wallet = new Wallet(hex_key);
    const walletManager = new WalletManager(wallet);
    return walletManager;
  }

  get address(): string {
    ///  Returns checksummed address.

    const publicKeyNoPrefix = this.wallet.signingKey.publicKey.slice(4);
    const hash = keccak_256(hexToBytes(publicKeyNoPrefix));
    const addressValue = "0x" + Buffer.from(hash.slice(-20)).toString("hex");
    const address = Address.fromString(addressValue);
    return address.checksum;
  }

  signMessage(message: string): string {
    // Sign an arbitrary message (with EIP-191 prefix).

    if (!message.length) {
      throw new Error("Can not sign empty message");
    }
    // const msgBytes = utf8ToBytes(message);

    // const prefix = `\x19Ethereum Signed Message:\n${msgBytes.length}`;
    // const prefixed = utf8ToBytes(prefix);

    // const hashedMessage = keccak_256(
    //   new Uint8Array([...prefixed, ...msgBytes]),
    // );
    const signature = this.wallet.signMessageSync(message);
    const recovered = verifyMessage(message, signature);
    if (recovered !== this.address) {
      throw Error("Signature verification failed!");
    }
    return signature;
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>,
  ): Promise<string> {
    // Sign EIP-712 typed data (used by many DeFi protocols).
    const signature = await this.wallet.signTypedData(domain, types, value);
    const recoveredAddress = verifyTypedData(domain, types, value, signature);

    if (recoveredAddress !== this.wallet.address) {
      throw Error("Signature verification failed!");
    }
    return signature;
  }

  async signTransaction(tx: CustomTransactionRequest): Promise<string> {
    // Sign a transaction dict.
    const raw = await this.wallet.signTransaction(tx.toDict());

    const parsed = Transaction.from(raw);

    if (parsed.from?.toLowerCase() !== this.wallet.address.toLowerCase()) {
      throw new Error("Transaction signature verification failed");
    }

    return raw;
  }

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
