import os
from dotenv import load_dotenv

load_dotenv()

prod = os.getenv("PRODUCTION", "false") == "true"
BINANCE_CONFIG = {
    "apiKey": os.getenv("BINANCE_TESTNET_API_KEY"),
    "secret": os.getenv("BINANCE_TESTNET_SECRET"),
    "sandbox": True,
    "options": {
        "defaultType": "spot",
    },
    "enableRateLimit": True,
    "ws_url": os.getenv("BINANCE_WS_URL"),
} if not prod else {
    "apiKey": os.getenv("BINANCE_API_KEY"),
    "secret": os.getenv("BINANCE_API_SECRET"),
    "sandbox": False,
    "options": {
        "defaultType": "spot",
    },
    "enableRateLimit": True,
    "ws_url": os.getenv("BINANCE_WS_URL"),
}
