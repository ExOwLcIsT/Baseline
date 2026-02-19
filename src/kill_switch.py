import os


KILL_SWITCH_FILE = "./tmp/arb_bot_kill"

def is_kill_switch_active() -> bool:
    return os.path.exists(KILL_SWITCH_FILE)