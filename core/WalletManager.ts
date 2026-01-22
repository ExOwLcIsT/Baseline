import { getPublicKey, sign, recoverPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils";
import util from "node:util";
import { Address } from "./BaseTypes/Address.js";
import { Wallet, getBytes } from "ethers";
class WalletManager {
  /*
    Manages wallet operations: key loading, signing, verification.

    Keys can be loaded from:
    - Environment variable
    - Encrypted keyfile (optional stretch goal)
  */

  private readonly wallet: Wallet;
  public static from_env(env_var: string = "privateKey"): WalletManager {
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
    const publicKeyNoPrefix = this.wallet.signingKey.publicKey.slice(2);
    const hash = keccak_256(publicKeyNoPrefix);
    const addressValue = "0x" + Buffer.from(hash.slice(-20)).toString("hex");
    const address = Address.fromString(addressValue);
    console.log("a1: " + address);
    console.log("a2: " + this.wallet.address);
    return address.checksum;
  }

  sign_message(message: string): //SignedMessage
  string {
    // Sign an arbitrary message (with EIP-191 prefix).

    if (message.length === 0) {
      throw Error("Can not sign empty message");
    }
    const msgBytes = utf8ToBytes(message);

    const prefix = `\x19Ethereum Signed Message:\n${msgBytes.length}`;
    const prefixed = utf8ToBytes(prefix);

    const hashedMessage = keccak_256(
      new Uint8Array([...prefixed, ...msgBytes]),
    );
    const signature = sign(hashedMessage, getBytes(this.wallet.privateKey), {
      format: "recovered",
    });
    const recoveredPublicKey = recoverPublicKey(signature, hashedMessage);

    const compressedPublicKey = getPublicKey(
      getBytes(this.wallet.privateKey),
      true,
    );
    if (bytesToHex(recoveredPublicKey) !== bytesToHex(compressedPublicKey)) {
      throw Error("Signature verification failed!");
    }

    return "0x" + Buffer.from(signature).toString("hex");
  }

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
