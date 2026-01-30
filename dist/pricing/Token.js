class Token {
    name;
    decimals;
    address;
    constructor(name, decimals, address) {
        this.name = name.toUpperCase();
        this.decimals = decimals;
        this.address = address;
    }
    equals(token0) {
        if (this.name === token0.name && this.decimals === token0.decimals)
            return true;
        return false;
    }
}
export default Token;
