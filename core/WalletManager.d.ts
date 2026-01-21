declare class WalletManager {
    private readonly privateKey;
    private readonly publicKey;
    static from_env(env_var?: string): WalletManager;
    constructor(key: Uint8Array);
    static generate(): WalletManager;
    get address(): string;
    toString(): string;
    toJSON(): {
        address: string;
    };
}
export default WalletManager;
//# sourceMappingURL=WalletManager.d.ts.map