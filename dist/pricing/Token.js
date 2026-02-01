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
        if (this.address.equals(token0.address))
            return true;
        return false;
    }
}
export default Token;
