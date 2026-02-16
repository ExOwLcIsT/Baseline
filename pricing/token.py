from core.base_types import Address


class Token:
    name: str
    decimals: int
    address: Address

    def __init__(self, name: str, decimals: int, address: Address):
        self.name = name.upper()
        self.decimals = decimals
        self.address = address

    def __eq__(self, other: Token) -> bool:
        if self.address.__eq__(other.address):
            return True
        return False
