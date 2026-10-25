import pyautogui
import pyperclip
import keyboard
import webbrowser

SOURCE_URL_PREFIX = "https://app.carousel-learning.com/quiz/"
TARGET_URL = "https://chatgpt.com/"
TARGET_URL_PREFIX = "https://chatgpt.com"

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
    pyautogui.sleep(0.1)
    focus_middle()

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
            pyautogui.sleep(0.05)
            current_url = get_current_url()

            if current_url.startswith(SOURCE_URL_PREFIX):
                tab_positions[SOURCE_URL_PREFIX] = tab_number
            if current_url.startswith(TARGET_URL_PREFIX):
                tab_positions[TARGET_URL_PREFIX] = tab_number

        if max_tabs == 2:
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
    pyautogui.sleep(0.05)
    focus_middle()
    return True


def focus_top():
    w, _ = pyautogui.size()
    pyautogui.moveTo(w // 2, 5)
    pyautogui.click()


def focus_middle():
    w, h = pyautogui.size()
    pyautogui.moveTo(w // 2, h // 2)
    pyautogui.click()



def run_process():
    global stop_flag
    stop_flag = False

    reset_devtools()

    # Find the Carousel quiz tab
    if not find_tab_with_prefix(SOURCE_URL_PREFIX):
        print("Carousel quiz tab not found.")
        return

    if stop_flag:
        return

    # Enter fullscreen before selecting the question
    pyautogui.press("f11")
    pyautogui.sleep(0.2)

    # Select the question text
    pyautogui.moveTo(584, 300)
    pyautogui.click()
    pyautogui.sleep(0.1)
    pyautogui.click()
    pyautogui.sleep(0.1)
    pyautogui.click()
    pyautogui.sleep(0.1)

    # Copy the question
    pyautogui.hotkey("ctrl", "c")
    pyautogui.sleep(0.15)
    question = pyperclip.paste().strip()

    if not question or stop_flag:
        print("No question text copied.")
        return

    # Exit fullscreen BEFORE searching for ChatGPT
    pyautogui.press("f11")
    pyautogui.sleep(0.2)
    focus_middle()

    # Find the ChatGPT tab
    target_found = find_tab_with_prefix(TARGET_URL_PREFIX)

    if not target_found:
        webbrowser.open(TARGET_URL)
        pyautogui.sleep(2)

        discover_tab_positions(max_tabs=3)
        if not find_tab_with_prefix(TARGET_URL_PREFIX):
            print("ChatGPT tab not found.")
            return

    if stop_flag:
        return

    # Focus the ChatGPT page and open the message composer
    focus_middle()
    pyautogui.sleep(0.1)
    pyautogui.hotkey("ctrl", "/")
    pyautogui.sleep(0.3)

    # Paste the question
    pyperclip.copy(question)
    pyautogui.hotkey("ctrl", "v")
    pyautogui.sleep(0.2)

    # Submit
    if not stop_flag:
        pyautogui.press("enter")


keyboard.add_hotkey("ctrl+shift+u", run_process)

print("Ready. CTRL+SHIFT+U to run, F8 to stop.")
print("Move the mouse to a screen corner to trigger PyAutoGUI's failsafe.")
keyboard.wait()