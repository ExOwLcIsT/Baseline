import WalletManager from "../core/WalletManager";
import { verifyMessage, Wallet } from "ethers";
import { CustomTransactionRequest } from "../core/BaseTypes/TransactionRequest";
import TokenAmount from "../core/BaseTypes/TokenAmount";
import { Address } from "../core/BaseTypes/Address";

import { expect, test, describe, beforeEach } from "vitest";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";

describe("WalletManager", () => {
  let walletManager: WalletManager;

  beforeEach(() => {
    // Hashes configuration
    secp.hashes.sha256 = (msg: Uint8Array) =>
      createHash("sha256").update(msg).digest();

    secp.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => {
      const h = createHmac("sha256", key);
      for (const m of msgs) h.update(m);
      return h.digest();
    };
    walletManager = WalletManager.generate();
  });

  test("generate() creates valid wallet with address", () => {
    expect(walletManager.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test("fromEnv() loads wallet correctly", () => {
    const tmp = Wallet.createRandom();

    process.env.PRIVATE_KEY = tmp.privateKey;

    const wm = WalletManager.fromEnv();

    expect(wm.address.toLowerCase()).toBe(tmp.address.toLowerCase());
  });

  test("signMessage() signs and verifies correctly", () => {
    const message = "hello world";

    const signature = walletManager.signMessage(message);

    const recovered = verifyMessage(message, signature);

    expect(recovered.toLowerCase()).toBe(walletManager.address.toLowerCase());
  });

  test("signMessage() throws on empty message", () => {
    expect(() => walletManager.signMessage("")).toThrow();
  });

  test("signTypedData() signs and verifies", async () => {
    const domain = {
      name: "TestApp",
      version: "1",
      chainId: 1,
    };

    const types = {
      Mail: [
        { name: "from", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    };

    const value = {
      from: walletManager.address,
      amount: 123n,
    };

    const signature = await walletManager.signTypedData(domain, types, value);

    const { verifyTypedData } = await import("ethers");

    const recovered = verifyTypedData(domain, types, value, signature);

    expect(recovered.toLowerCase()).toBe(walletManager.address.toLowerCase());
  });

  test("signTransaction() signs tx and preserves sender", async () => {
    const tx = new CustomTransactionRequest({
      to: Address.fromString(walletManager.address),
      value: TokenAmount.fromRaw(0n, 18),
      chainId: 1,
      nonce: 0,
      gasLimit: 21_000,
      maxFeePerGas: 1n,
      maxPriorityFee: 1n,
    });

    const raw = await walletManager.signTransaction(tx);

    const { Transaction } = await import("ethers");

    const parsed = Transaction.from(raw);

    expect(parsed.from?.toLowerCase()).toBe(
      walletManager.address.toLowerCase(),
    );
  });

  test("toString hides private key", () => {
    const s = walletManager.toString();
    expect(s).toContain("address=");
    expect(s).not.toContain("private");
  });

  test("toJSON returns address only", () => {
    const j = walletManager.toJSON();
    expect(j).toEqual({ address: walletManager.address });
  });
});
