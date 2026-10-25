const TARGETS = {
  carousel: {
    source: (url) =>
      url.hostname === "app.carousel-learning.com" &&
      url.pathname.startsWith("/quiz/"),
    url: "https://chatgpt.com/"
  },
  sparx: {
    source: (url) =>
      url.hostname === "maths.sparx-learning.com" &&
      url.pathname.startsWith("/student/"),
    url: "https://www.gauthmath.com/"
  }
};

let activeRun;
let carouselAnswerQueue = Promise.resolve();
let carouselAnswerTabId;
let lastCarouselExpectedCount = 0;

chrome.commands.onCommand.addListener((command) => {
  if (command === "cancel-solver") {
    cancelSolver();
    return;
  }

  const action = command === "run-solver"
    ? runSolver()
    : command === "clear-site-data"
      ? clearActiveSiteData()
      : Promise.resolve();

  action.then(
    (message) => setStatus("OK", message),
    (error) => {
      const cancelled = error.message === "Solver cancelled.";
      setStatus(cancelled ? "STOP" : "ERR", error.message);
      if (!cancelled) {
        console.error(error);
      }
    }
  );
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let action;

  if (message.action === "run-solver") {
    action = runSolver();
  } else if (message.action === "clear-site-data") {
    action = clearActiveSiteData();
  } else if (message.action === "cancel-solver") {
    action = Promise.resolve(cancelSolver());
  } else {
    return false;
  }

  action.then(
    (result) => {
      if (message.action !== "cancel-solver") {
        setStatus("OK", result);
      }
      sendResponse({ ok: true, message: result });
    },
    (error) => {
      setStatus(
        error.message === "Solver cancelled." ? "STOP" : "ERR",
        error.message
      );
      sendResponse({ ok: false, error: error.message });
    }
  );
  return true;
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (tab?.id === undefined || !tab.url) {
    throw new Error("No active web page was found.");
  }
  return tab;
}

async function runSolver() {
  if (activeRun) {
    const elapsedSeconds = Math.floor((Date.now() - activeRun.startedAt) / 1000);
    throw new Error(
      `A solver workflow is still running (${elapsedSeconds}s). Wait for it to finish or cancel it from the popup or press Ctrl+Shift+Y.`
    );
  }
  let rejectOnCancel;
  const cancellation = new Promise((_, reject) => {
    rejectOnCancel = reject;
  });
  const run = {
    cancelled: false,
    startedAt: Date.now(),
    cancel: () => rejectOnCancel(new Error("Solver cancelled."))
  };
  activeRun = run;
  let rejectOnTimeout;
  const deadline = new Promise((_, reject) => {
    rejectOnTimeout = reject;
  });
  const timeout = setTimeout(() => {
    run.cancelled = true;
    rejectOnTimeout(new Error("Solver timed out after 3 minutes. Run it again."));
  }, 180000);

  try {
    return await Promise.race([
      runSolverWorkflow(run),
      cancellation,
      deadline
    ]);
  } finally {
    clearTimeout(timeout);
    if (activeRun === run) {
      activeRun = undefined;
    }
  }
}

function cancelSolver() {
  if (!activeRun) {
    return "No solver workflow is running.";
  }
  activeRun.cancelled = true;
  activeRun.cancel();
  setStatus("STOP", "Solver cancellation requested");
  return "Solver cancellation requested. You can run it again.";
}

async function runSolverWorkflow(run) {
  const sourceTab = await getActiveTab();
  ensureActive(run);
  const sourceUrl = new URL(sourceTab.url);
  const mode = Object.entries(TARGETS).find(([, target]) =>
    target.source(sourceUrl)
  )?.[0];

  if (!mode) {
    throw new Error("Open a Carousel quiz or Sparx student page to use the solver.");
  }

  if (mode === "carousel") {
    const [{ result: question }] = await chrome.scripting.executeScript({
      target: { tabId: sourceTab.id },
      func: getCarouselQuestion
    });
    ensureActive(run);
    if (!question) {
      throw new Error(
        "Could not identify the visible Carousel question. Make sure the question is open, then try again."
      );
    }

    const targetTab = await openTargetTab(TARGETS.carousel.url);
    await waitForTab(targetTab.id, run);
    const [{ result: previousAnswer }] = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: getChatGptAnswerState
    });
    ensureActive(run);
    if (carouselAnswerTabId !== targetTab.id) {
      carouselAnswerTabId = targetTab.id;
      lastCarouselExpectedCount = previousAnswer.count;
    }
    const expectedAnswerCount =
      Math.max(previousAnswer.count, lastCarouselExpectedCount) + 1;
    const [{ result: submitted }] = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: submitText,
      args: [question]
    });
    if (!submitted) {
      throw new Error("ChatGPT opened, but its message composer was not available.");
    }
    ensureActive(run);
    lastCarouselExpectedCount = expectedAnswerCount;
    queueCarouselAnswerCopy(targetTab.id, expectedAnswerCount);
    return "Carousel question sent to ChatGPT. Its answer will be copied when ready.";
  }

  const screenshot = await chrome.tabs.captureVisibleTab(sourceTab.windowId, {
    format: "png"
  });
  ensureActive(run);
  const [{ result: pressedEnter }] = await chrome.scripting.executeScript({
    target: { tabId: sourceTab.id },
    func: pressEnterOnPage
  });
  if (!pressedEnter) {
    throw new Error("The Sparx page did not accept the Enter key action.");
  }
  ensureActive(run);
  const targetTab = await openTargetTab(TARGETS.sparx.url);
  await waitForTab(targetTab.id, run);
  ensureActive(run);
  const [{ result: uploaded }] = await chrome.scripting.executeScript({
    target: { tabId: targetTab.id },
    func: uploadImage,
    args: [screenshot]
  });
  if (uploaded) {
    return "Sparx advanced with Enter, and the question screenshot was attached in GauthMath.";
  }

  await chrome.downloads.download({
    url: screenshot,
    filename: "Screenshot.png",
    conflictAction: "uniquify",
    saveAs: false
  });
  return "Sparx advanced with Enter. Screenshot saved in Downloads as Screenshot.png; attach it in GauthMath.";
}

async function openTargetTab(url) {
  const [existing] = await chrome.tabs.query({ url: `${url}*` });
  if (existing?.id) {
    return chrome.tabs.update(existing.id, { active: true });
  }
  return chrome.tabs.create({ url, active: true });
}

function waitForTab(tabId, run) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancelCheck = setInterval(() => {
      if (run.cancelled) {
        finish(new Error("Solver cancelled."));
      }
    }, 100);
    const timeout = setTimeout(() => {
      finish(new Error("The solver page took too long to load."));
    }, 30000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearInterval(cancelCheck);
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (!settled && tab.status === "complete") {
        finish();
      }
    }, (error) => {
      finish(error);
    });
  });
}

function ensureActive(run) {
  if (run.cancelled) {
    throw new Error("Solver cancelled.");
  }
}

async function clearActiveSiteData() {
  const tab = await getActiveTab();
  await clearSiteDataForTab(tab);
  return `Cookies and cache cleared for ${new URL(tab.url).hostname}.`;
}

async function clearSiteDataForTab(tab) {
  if (tab.id === undefined || !tab.url) {
    throw new Error("The tab does not have a clearable site address.");
  }
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    throw new Error("The active tab does not have a clearable site address.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Cookies and cache can only be cleared for a web page.");
  }

  await chrome.browsingData.remove(
    { origins: [url.origin] },
    { cookies: true, cache: true }
  );
  await chrome.tabs.reload(tab.id);
}

function queueCarouselAnswerCopy(tabId, expectedAnswerCount) {
  carouselAnswerQueue = carouselAnswerQueue
    .then(async () => {
      const run = { cancelled: false };
      const answer = await waitForChatGptAnswer(
        tabId,
        run,
        expectedAnswerCount
      );
      const [{ result: copied }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: copyTextToClipboard,
        args: [answer]
      });
      if (!copied) {
        throw new Error("ChatGPT answered, but the answer could not be copied.");
      }
      setStatus("OK", "ChatGPT answer copied to clipboard");
    })
    .catch((error) => {
      setStatus("ERR", error.message);
      console.error(error);
    });
}

async function waitForChatGptAnswer(tabId, run, expectedAnswerCount) {
  let lastText = "";
  let stableChecks = 0;

  for (let attempt = 0; attempt < 180; attempt += 1) {
    ensureActive(run);
    const [{ result: state }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: getChatGptAnswerState
    });
    if (state.count >= expectedAnswerCount && state.text && !state.generating) {
      if (state.text === lastText) {
        stableChecks += 1;
      } else {
        lastText = state.text;
        stableChecks = 0;
      }
      if (stableChecks >= 2) {
        return state.text;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("No completed ChatGPT answer appeared before the 3-minute timeout.");
}

function setStatus(text, title) {
  chrome.action.setBadgeBackgroundColor({
    color: text === "ERR" ? "#b42318" : "#188038"
  });
  chrome.action.setBadgeText({ text });
  chrome.action.setTitle({ title: title || "Homework Solver" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

function pressEnterOnPage() {
  const target = document.activeElement || document.body || document.documentElement;
  if (!target) {
    return false;
  }

  for (const type of ["keydown", "keypress", "keyup"]) {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      })
    );
  }
  return true;
}

function getCarouselQuestion() {
  const selected = window.getSelection()?.toString().trim();
  if (selected && selected.length >= 8) {
    return selected.slice(0, 20000);
  }

  const isVisible = (element) =>
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden";
  const getText = (element) => {
    const visibleText = element.innerText?.trim() || "";
    const mathLabels = [
      ...element.querySelectorAll("img[alt], svg[aria-label], [aria-label]")
    ]
      .map((child) => child.getAttribute("alt") || child.getAttribute("aria-label"))
      .filter(Boolean);
    return [visibleText, ...mathLabels]
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };
  const questionNodes = [
    ...document.querySelectorAll(
      '[data-testid*="question" i], [id*="question" i], [class*="question" i]'
    )
  ].filter(isVisible);
  const usefulQuestionNodes = questionNodes
    .map((element) => ({ element, text: getText(element) }))
    .filter(({ text }) => text.length >= 12 && text.length <= 12000)
    .sort((a, b) => a.text.length - b.text.length);
  const mainNodes = [
    ...document.querySelectorAll("main, [role='main'], article")
  ].filter(isVisible);
  const mainText = mainNodes
    .map(getText)
    .filter((text) => text.length >= 12 && text.length <= 20000)
    .sort((a, b) => b.length - a.length)[0];
  const pageText = getText(document.body);
  const candidate =
    usefulQuestionNodes.find(({ element }) =>
      element.querySelector('button, label, [role="radio"], input[type="radio"]')
    )?.text ||
    usefulQuestionNodes.at(-1)?.text ||
    mainText ||
    pageText;

  return candidate
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !/^(?:next|previous|submit|check answer|show answer|skip|menu|settings)$/i.test(line)
    )
    .join("\n")
    .slice(0, 20000);
}

function getChatGptAnswerState() {
  const messages = [
    ...document.querySelectorAll('[data-message-author-role="assistant"]')
  ];
  const latest = messages.at(-1);
  return {
    text: latest?.innerText?.trim() || "",
    count: messages.length,
    generating: Boolean(
      document.querySelector(
        'button[data-testid="stop-button"], button[aria-label*="Stop generating" i]'
      )
    )
  };
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API access can vary between page contexts; try the legacy API.
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function submitText(text) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const editor =
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector("textarea");

    if (editor && !editor.hasAttribute("disabled")) {
      editor.focus();
      if (editor instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        setter?.call(editor, text);
        editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        editor.replaceChildren(document.createTextNode(text));
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: text
          })
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      const sendButton = document.querySelector(
        'button[data-testid="send-button"]'
      );
      if (sendButton && !sendButton.disabled) {
        sendButton.click();
      } else {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true
          })
        );
      }
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function uploadImage(dataUrl) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const input = [...document.querySelectorAll('input[type="file"]')].find(
      (candidate) =>
        !candidate.disabled &&
          (!candidate.accept || /image|\*/i.test(candidate.accept))
    );

    if (input) {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], "sparx-question.png", {
        type: "image/png"
      });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      const isVisible = (element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden";
      const actionButtons = [
        ...document.querySelectorAll(
          'button, [role="button"], input[type="submit"]'
        )
      ].filter((button) => {
        const label = [
          button.innerText,
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          button.getAttribute("value")
        ].filter(Boolean).join(" ").toLowerCase();
        return isVisible(button) &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true" &&
          /\b(solve|submit|send|ask|get answer)\b/.test(label);
      });
      if (actionButtons.length === 1) {
        actionButtons[0].click();
      }
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
