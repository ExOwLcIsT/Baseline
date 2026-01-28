export class Token {
    name;
    decimals;
    constructor(name, decimals) {
        this.name = name.toUpperCase();
        this.decimals = decimals;
    }
    equals(token0) {
        if (this.name === token0.name && this.decimals === token0.decimals)
            return true;
        return false;
    }
}
