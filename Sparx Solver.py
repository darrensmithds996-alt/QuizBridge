import pyautogui
import pyperclip
import keyboard
import webbrowser

SOURCE_URL_PREFIX = "https://maths.sparx-learning.com/student/"
TARGET_URL = "https://www.gauthmath.com/"
TARGET_URL_PREFIX = "https://www.gauthmath.com"

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.01
pyautogui.MINIMUM_DURATION = 0
pyautogui.MINIMUM_SLEEP = 0

stop_flag = False
tab_positions = {}
tabs_discovered = False


def stop_script():
    global stop_flag
    stop_flag = True


keyboard.add_hotkey("f8", stop_script)


def reset_devtools():
    pyautogui.hotkey("ctrl", "shift", "c")
    pyautogui.sleep(0.05)
    pyautogui.press("f12")


def get_current_url():
    pyperclip.copy("")
    pyautogui.hotkey("ctrl", "l")
    pyautogui.sleep(0.2)
    pyautogui.hotkey("ctrl", "c")
    pyautogui.sleep(0.1)
    current_url = pyperclip.paste().strip()
    pyautogui.press("esc")
    if not current_url.startswith(("http://", "https://")):
        return ""
    return current_url


def discover_tab_positions(max_tabs=2):
    global tabs_discovered

    try:
        for tab_number in range(1, max_tabs + 1):
            if stop_flag:
                return False

            pyautogui.hotkey("ctrl", str(tab_number))
            pyautogui.sleep(0.1)
            current_url = get_current_url()

            if current_url.startswith(SOURCE_URL_PREFIX):
                tab_positions[SOURCE_URL_PREFIX] = tab_number
            if current_url.startswith(TARGET_URL_PREFIX):
                tab_positions[TARGET_URL_PREFIX] = tab_number

        tabs_discovered = True
        return True
    finally:
        focus_middle()


def find_tab_with_prefix(prefix):
    if not tabs_discovered and not discover_tab_positions():
        return False

    tab_number = tab_positions.get(prefix)
    if tab_number is None:
        return False

    pyautogui.hotkey("ctrl", str(tab_number))
    pyautogui.sleep(0.1)
    return True


def focus_top():
    w, _ = pyautogui.size()
    pyautogui.moveTo(w // 2, 5)
    pyautogui.click()


def focus_middle():
    w, h = pyautogui.size()
    pyautogui.moveTo(w // 2, h // 2)
    pyautogui.click()


def clear_cache_if_limited():
    try:
        focus_middle()
        pyperclip.copy("")
        pyautogui.hotkey("ctrl", "a")
        pyautogui.sleep(0.1)
        pyautogui.hotkey("ctrl", "c")
        pyautogui.sleep(0.2)
        page_text = " ".join(pyperclip.paste().casefold().split())
        pyautogui.press("esc")

        limit_markers = (
            "back-to-school",
            "back to school",
            "limited offer",
        )
        offer_positions = [page_text.find(marker) for marker in limit_markers]
        offer_positions = [position for position in offer_positions if position >= 0]
        offer_index = min(offer_positions) if offer_positions else -1
        before_offer = page_text[:offer_index] if offer_index >= 0 else ""
        has_answer_section = any(
            heading in before_offer for heading in ("questionanswer", "question answer")
        )

        if offer_index >= 0 and not has_answer_section:
            print("GauthMath limit detected; clearing cache.")
            pyautogui.hotkey("ctrl", "shift", "k")
            pyautogui.sleep(0.5)
            return True
        return False
    finally:
        focus_middle()


def run_process():
    global stop_flag
    stop_flag = False

    reset_devtools()

    if not find_tab_with_prefix(SOURCE_URL_PREFIX):
        print("Sparx tab not found.")
        return

    target_found = find_tab_with_prefix(TARGET_URL_PREFIX)

    if not target_found:
        webbrowser.open(TARGET_URL)
        pyautogui.sleep(1.5)
        discover_tab_positions(max_tabs=3)
        if not find_tab_with_prefix(TARGET_URL_PREFIX):
            print("GauthMath tab not found.")
            return

    if stop_flag:
        return

    if not find_tab_with_prefix(SOURCE_URL_PREFIX):
        print("Sparx tab not found.")
        return

    pyautogui.press("f11")
    pyautogui.sleep(0.05)

    pyautogui.hotkey("win", "printscreen")
    pyautogui.sleep(0.5)

    focus_top()
    pyautogui.press("enter")

    if not find_tab_with_prefix(TARGET_URL_PREFIX):
        print("GauthMath tab not found.")
        return

    focus_middle()

    pyautogui.press("/")
    pyautogui.sleep(0.03)

    pyautogui.hotkey("ctrl", "v")

    pyautogui.press("f11")
    pyautogui.sleep(0.05)
    pyautogui.sleep(8.0)
    clear_cache_if_limited()
    focus_middle()

keyboard.add_hotkey("ctrl+shift+u", run_process)

print("Ready. CTRL+SHIFT+U to run, F8 to stop.")
keyboard.wait()