import { getPublicKey, sign, recoverPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes, } from "@noble/hashes/utils";
import util from "node:util";
import { Address } from "./BaseTypes/Address.js";
import { Transaction, Wallet, getBytes, verifyTypedData, } from "ethers";
class WalletManager {
    /*
      Manages wallet operations: key loading, signing, verification.
  
      Keys can be loaded from:
      - Environment variable
      - Encrypted keyfile (optional stretch goal)
    */
    wallet;
    static fromEnv(env_var = "PRIVATE_KEY") {
        const key = process.env[env_var];
        if (!key) {
            throw new Error(`${env_var} not found`);
        }
        const wallet = new Wallet(key);
        const walletManager = new WalletManager(wallet);
        return walletManager;
    }
    constructor(wallet) {
        this.wallet = wallet;
    }
    static generate() {
        //     Generate a new random wallet. Returns manager + displays private key ONCE.
        const key = randomBytes(32);
        const hex_key = bytesToHex(key);
        console.log("Private key: " + hex_key);
        const wallet = new Wallet(hex_key);
        const walletManager = new WalletManager(wallet);
        return walletManager;
    }
    get address() {
        ///  Returns checksummed address.
        const publicKeyNoPrefix = this.wallet.signingKey.publicKey.slice(4);
        const hash = keccak_256(hexToBytes(publicKeyNoPrefix));
        const addressValue = "0x" + Buffer.from(hash.slice(-20)).toString("hex");
        const address = Address.fromString(addressValue);
        return address.checksum;
    }
    signMessage(message) {
        // Sign an arbitrary message (with EIP-191 prefix).
        if (message.length === 0) {
            throw Error("Can not sign empty message");
        }
        const msgBytes = utf8ToBytes(message);
        const prefix = `\x19Ethereum Signed Message:\n${msgBytes.length}`;
        const prefixed = utf8ToBytes(prefix);
        const hashedMessage = keccak_256(new Uint8Array([...prefixed, ...msgBytes]));
        const signature = sign(hashedMessage, getBytes(this.wallet.privateKey), {
            format: "recovered",
        });
        const recoveredPublicKey = recoverPublicKey(signature, hashedMessage);
        const compressedPublicKey = getPublicKey(getBytes(this.wallet.privateKey), true);
        if (bytesToHex(recoveredPublicKey) !== bytesToHex(compressedPublicKey)) {
            throw Error("Signature verification failed!");
        }
        return "0x" + Buffer.from(signature).toString("hex");
    }
    async signTypedData(domain, types, value) {
        // Sign EIP-712 typed data (used by many DeFi protocols).
        const signature = await this.wallet.signTypedData(domain, types, value);
        const recoveredAddress = verifyTypedData(domain, types, value, signature);
        if (recoveredAddress !== this.wallet.address) {
            throw Error("Signature verification failed!");
        }
        return "0x" + Buffer.from(signature).toString("hex");
    }
    async signTransaction(tx) {
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
