# notifications/telegram.py

import urllib.request
import urllib.parse
import json
import logging
import os
from dataclasses import dataclass

KILL_SWITCH_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "tmp",
    "arb_bot_kill"
)


@dataclass
class TelegramConfig:
    bot_token: str = os.getenv("BOT_TOKEN")
    chat_id: str = os.getenv("CHAT_ID")


class TelegramNotifier:
    def __init__(self, config: TelegramConfig):
        self.config = config
        self._offset = 0

    def _send(self, text: str, reply_markup: dict = None):
        try:
            payload = {
                "chat_id":    self.config.chat_id,
                "text":       text,
                "parse_mode": "Markdown",
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup

            req = urllib.request.Request(
                f"https://api.telegram.org/bot{self.config.bot_token}/sendMessage",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            logging.error(f"Telegram send failed: {e}")

    def _get_updates(self) -> list:
        try:
            url = (
                f"https://api.telegram.org/bot{self.config.bot_token}"
                f"/getUpdates?offset={self._offset}&timeout=1"
            )
            req = urllib.request.Request(url)
            response = urllib.request.urlopen(req, timeout=5)
            data = json.loads(response.read())
            return data.get("result", [])
        except Exception as e:
            logging.error(f"Telegram getUpdates failed: {e}")
            return []

    def _get_kill_switch_keyboard(self) -> dict:
        is_active = os.path.exists(KILL_SWITCH_FILE)
        return {
            "inline_keyboard": [[
                {
                    "text": "🛑 ACTIVATE KILL SWITCH" if not is_active else "✅ DEACTIVATE KILL SWITCH",
                    "callback_data": "kill_switch_toggle",
                }
            ]]
        }

    def send_status(self, status: dict):
        """Send status message with kill switch button."""
        is_active = os.path.exists(KILL_SWITCH_FILE)
        kill_status = "🛑 ACTIVE" if is_active else "✅ INACTIVE"
        self._send(
            f"📊 *BOT STATUS*\n"
            f"Capital:     `${status['current_capital']:.2f}`\n"
            f"Drawdown:    `{status['drawdown_pct']:.1f}%`\n"
            f"Daily loss:  `${status['daily_loss']:.2f}`\n"
            f"Trades/hour: `{status['trades_last_hour']}`\n"
            f"Kill switch: {kill_status}",
            reply_markup=self._get_kill_switch_keyboard(),
        )

    def poll_commands(self):
        """
        Poll for button presses. Call this in your bot loop.
        Handles kill switch toggle.
        """
        updates = self._get_updates()
        for update in updates:
            self._offset = update["update_id"] + 1

            # handle button press
            callback = update.get("callback_query")
            if callback and callback.get("data") == "kill_switch_toggle":
                self._answer_callback(callback["id"])
                print("asd")
                self._toggle_kill_switch()

    def _answer_callback(self, callback_id: str):
        """Required by Telegram — must acknowledge button press."""
        try:
            payload = json.dumps({"callback_query_id": callback_id}).encode()
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{self.config.bot_token}/answerCallbackQuery",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            logging.error(f"Telegram answerCallback failed: {e}")

    def _toggle_kill_switch(self):
        if os.path.exists(KILL_SWITCH_FILE):
            os.remove(KILL_SWITCH_FILE)
            self._send(
                "✅ *KILL SWITCH DEACTIVATED*\n"
                "Bot will resume on next tick.",
                reply_markup=self._get_kill_switch_keyboard(),
            )
            logging.info("Kill switch deactivated via Telegram")
        else:
            os.makedirs(os.path.dirname(KILL_SWITCH_FILE), exist_ok=True)
            open(KILL_SWITCH_FILE, "w").close()
            self._send(
                "🛑 *KILL SWITCH ACTIVATED*\n"
                "Bot is stopping.",
                reply_markup=self._get_kill_switch_keyboard(),
            )
            logging.critical("Kill switch activated via Telegram")

    # ------------------------------------------------------------------ #
    #  Trade events                                                        #
    # ------------------------------------------------------------------ #

    def trade_success(self, pair: str, direction: str, pnl: float, spread_bps: float):
        self._send(
            f"✅ *TRADE SUCCESS*\n"
            f"Pair:      `{pair}`\n"
            f"Direction: `{direction}`\n"
            f"Spread:    `{spread_bps:.1f} bps`\n"
            f"PnL:       `${pnl:.4f}`"
        )

    def trade_failed(self, pair: str, reason: str):
        self._send(
            f"❌ *TRADE FAILED*\n"
            f"Pair:   `{pair}`\n"
            f"Reason: `{reason}`"
        )

    def trade_unwound(self, pair: str, pnl: float):
        self._send(
            f"⚠️ *POSITION UNWOUND*\n"
            f"Pair: `{pair}`\n"
            f"PnL:  `${pnl:.4f}`"
        )

    def risk_blocked(self, pair: str, reason: str):
        self._send(
            f"🚫 *RISK CHECK BLOCKED TRADE*\n"
            f"Pair:   `{pair}`\n"
            f"Reason: `{reason}`"
        )

    def circuit_breaker_tripped(self, reason: str, failures: int, cooldown: float):
        self._send(
            f"🔴 *CIRCUIT BREAKER TRIPPED*\n"
            f"Reason:   `{reason}`\n"
            f"Failures: `{failures}`\n"
            f"Cooldown: `{cooldown:.0f}s`"
        )

    def kill_switch_activated(self):
        self._send("🛑 *KILL SWITCH ACTIVATED — BOT STOPPED*")

    def bot_started(self, pairs: list[str], simulation: bool):
        mode = "SIMULATION" if simulation else "🟢 LIVE"
        self._send(
            f"🟢 *BOT STARTED*\n"
            f"Mode:  `{mode}`\n"
            f"Pairs: `{', '.join(pairs)}`",
            reply_markup=self._get_kill_switch_keyboard(),
        )

    def bot_stopped(self):
        self._send("⛔ *BOT STOPPED*")

    def error(self, context: str, error: str):
        self._send(
            f"🆘 *ERROR*\n"
            f"Context: `{context}`\n"
            f"Error:   `{error}`"
        )
