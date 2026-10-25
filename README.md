# QuizBridge - Homework Solver

I made this Chromium browser extension to bring together two homework-question
workflows I had been working on: reading a Carousel question and sending it to
ChatGPT, and capturing a Sparx question and attaching its screenshot in
GauthMath. It also includes a tool for clearing cookies and cached data for the
current website origin.

The extension is designed to help prepare and transfer a question. It does not
type a ChatGPT or GauthMath answer into Carousel or Sparx.

## Where this came from

This extension follows work I published in these GitHub repositories:

1. [Sparth - A utility to take your Sparx screenshots to Gauth](https://github.com/darrensmithds996-alt/Sparth-A-utiltity-to-take-your-sparx-screenshots-to-gauth-)
   is my earlier Sparx-to-GauthMath automation project. That project uses a
   Python script and desktop keyboard/mouse automation. It switches between
   browser tabs, captures the Sparx question, and sends or prepares the image
   for GauthMath. Its README also describes the setup and the external browser
   extensions that the original script expected.
2. [Cookie clear](https://github.com/AlphaKennyBody12/Cookie-clear-Can-be-used-to-bypass-Gauth-limited-uses-)
   is my earlier Chromium extension project. Its README describes clearing
   cookies and cache for the current page and refreshing it.

This project puts the relevant workflows in one Manifest V3 extension rather
than relying on desktop-coordinate automation for these actions. The current
extension uses Chromium extension APIs and scripts in the open pages. The
Carousel-to-ChatGPT workflow is also included here.

The cookie/cache action is documented here as browser-data management. It
removes data for the current page's origin; it cannot guarantee any change to
server-side account state, usage limits, or service policies. Use each website
and extension in accordance with its terms.

## What it does

### Carousel to ChatGPT

Supported source pages must be on
`https://app.carousel-learning.com/quiz/...`.

1. Open the Carousel quiz and display the question you want to ask about.
2. Run the extension while the Carousel page is the active tab.
3. The extension reads the current text selection if it contains enough text.
   Otherwise, it looks for visible question-related page elements, then
   visible main content, and finally visible page text. It also reads image
   alternative text and accessible labels when found. It filters out a small
   set of standalone navigation labels and limits the extracted text to
   20,000 characters.
4. It opens a ChatGPT tab at `https://chatgpt.com/`, or reuses an open matching
   tab, waits for the page to finish loading, and submits the extracted text in
   ChatGPT's message composer.
5. The workflow action finishes after the question is submitted. Separately,
   a background queue watches for the next ChatGPT response, waits until the
   response appears complete and stable, then copies its text to the clipboard.
   This wait can take up to three minutes.

The extension does not enter the returned answer into Carousel. It sends the
question to ChatGPT through the ChatGPT page open in your browser; ChatGPT
account access and service behavior are outside this extension.

### Sparx to GauthMath

Supported source pages must be on
`https://maths.sparx-learning.com/student/...`.

1. Open the Sparx student page and display the question you want to capture.
2. Run the extension while the Sparx page is the active tab.
3. It captures the visible browser tab as a PNG before advancing the page.
4. It dispatches Enter key events to the currently focused element on Sparx.
5. It opens a GauthMath tab at `https://www.gauthmath.com/`, or reuses an open
   matching tab, and waits for the page to finish loading.
6. It looks for an enabled image file-upload input and attaches the captured
   PNG as `sparx-question.png`. If exactly one visible, enabled button appears
   to be an action such as Solve, Submit, Send, Ask, or Get answer, it clicks
   that button.
7. If it cannot find an eligible image upload input, it saves the screenshot
   to the browser's Downloads folder as `Screenshot.png`. If that name already
   exists, the browser uses a unique name, for example `Screenshot (1).png`.
   Attach the downloaded screenshot in GauthMath yourself in that case.

The extension does not type a solution into Sparx. The image is sent to
GauthMath by attaching it on the GauthMath page; if the page exposes exactly
one matching action button, the extension may click it to submit or request
work on that image. Which controls are present depends on GauthMath's current
page.

### Clear site cookies and cache

The **Clear site cookies & cache** button and its keyboard shortcut:

- Read the active tab's web origin (scheme, hostname, and port).
- Ask Chromium to remove cookies and cache for that origin only.
- Reload the active tab after the removal completes.

It does not clear browsing history, saved passwords, or data for every site.
Clearing cookies can sign you out or reset local site state. Clearing browser
data does not guarantee that a service's server-side account state or limits
will change.

### Cancel a solver workflow

If a solver workflow appears stuck, open the extension popup and choose
**Cancel running workflow**, or press **Ctrl+Shift+Y**. If the popup was already
open during a long-running action, close and reopen it to enable its controls
again. Cancellation releases the extension's active-workflow lock so another
run can be started. It cannot undo a browser action that has already been
dispatched, which may take a moment to settle.

## Install

For the easiest installation, download **`extension.zip`** from the project's
GitHub Releases and extract it. That is the only download you need. The
`Sparx Solver.py` and `Carousel Solver.py` files are not required to use this
extension. No Python installation or external Python packages are required.

1. Extract `extension.zip` from the GitHub release.
2. Open the browser's extension management page:
   - Chrome: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`
   - Other Chromium browsers: use that browser's extensions page.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extracted folder containing `manifest.json`.
6. Pin the extension if you want convenient access to its popup.
7. Keep the browser signed in to the relevant services and open the correct
   source page before running a workflow.

After changing extension files, return to the extensions page and press the
extension's **Reload** button. If a workflow is stuck after an update, cancel
it or reload the extension before trying again.

## Using the popup and shortcuts

| Action | Popup control | Default shortcut | What it does |
| --- | --- | --- | --- |
| Run solver for this page | **Run solver for this page** | **Ctrl+Shift+U** | Chooses the workflow based on the active Carousel or Sparx page. |
| Clear site cookies & cache | **Clear site cookies & cache** | **Ctrl+Shift+K** | Clears cookies and cache for the active web origin, then reloads it. |
| Cancel running workflow | **Cancel running workflow** | **Ctrl+Shift+Y** | Cancels the active solver workflow and releases its run lock. |

Keyboard shortcuts can be changed at `chrome://extensions/shortcuts` or the
equivalent shortcut settings page in your browser. A shortcut may conflict
with another extension, browser, or operating-system shortcut.

The popup shows action status. The extension also uses the toolbar badge and
title to indicate success, an error, or a cancellation. The badge clears after
a few seconds.

## Supported pages and behavior

| Service | Supported page | Role |
| --- | --- | --- |
| Carousel | `app.carousel-learning.com/quiz/...` | Source of question text |
| ChatGPT | `chatgpt.com` | Receives Carousel question; completed response is copied |
| Sparx | `maths.sparx-learning.com/student/...` | Source of screenshot; receives a synthetic Enter action |
| GauthMath | `www.gauthmath.com` | Receives Sparx screenshot attachment |

The extension checks the hostname and path for the two source services. It
does not run the solver on arbitrary pages. The target services must be
reachable, and their pages must expose the controls and page structure the
extension expects. Website updates may change those structures.

## Permissions

The extension requests these Chromium permissions:

| Permission | Why the extension requests it |
| --- | --- |
| `browsingData` | Remove cookies and cache for the active page's origin. |
| `clipboardWrite` | Copy a completed ChatGPT answer to the clipboard. |
| `downloads` | Save a Sparx screenshot if GauthMath's image upload input is not found. |
| `scripting` | Read visible question text and interact with the supported service pages. |
| `tabs` | Find, activate, create, reload, and inspect browser tabs used by the workflows. |
| `<all_urls>` host access | Permit scripts and origin-specific browser-data operations on the active supported pages and destination pages. The workflow itself checks for the supported source hosts before proceeding. |

## Privacy and data handling

- The extension has no project-owned server or custom API endpoint.
- For Carousel, question text is read from the page and entered into the
  ChatGPT page. ChatGPT processes that prompt under its own account settings
  and policies.
- For Sparx, a screenshot is captured locally in the browser and attached to
  the GauthMath page. If attachment is unavailable, the image is downloaded
  locally instead.
- When answer copying succeeds, the response text is written to the system
  clipboard.
- The extension clears the active origin's cookies and cache only when you
  choose that action or invoke its shortcut.
- The extension does not intentionally send question content to a separate
  service operated by this project. The destination websites may process
  submitted questions and images according to their own policies.

## Limits and failure cases

- The active tab must be a supported Carousel quiz or Sparx student page when
  **Run solver for this page** is invoked.
- The source question must be visible and readable in the page structure or
  text selection. Some diagrams, canvas content, or inaccessible images may
  not be captured as text by Carousel extraction. The Sparx workflow uses a
  screenshot, so the captured view depends on what is visible in the browser.
- ChatGPT and GauthMath must load successfully and be usable in the current
  browser session. Login prompts, consent screens, network problems, or
  changed page controls can prevent completion.
- The extension waits up to 30 seconds for a target tab to finish loading. A
  solver workflow has a three-minute overall timeout.
- Carousel answer copying is a separate background task after submission. The
  popup may report that the question was sent before the answer is ready.
  Answer detection depends on ChatGPT's page structure and may need updating
  if that site changes.
- The Sparx Enter action sends keyboard events to the currently focused page
  element. Review the page before running it so Enter has the intended effect.
- The extension does not verify that a screenshot depicts the intended
  question, that the target accepted an upload, or that a generated response
  is correct.
- Clearing local cookies and cache may affect sign-in and local browser state;
  it does not guarantee any particular result from the website.

## Troubleshooting

### "Open a Carousel quiz or Sparx student page to use the solver."

Make the relevant source tab active and confirm that its address matches one
of the supported URL patterns above. The workflow selects its mode from the
active tab, not from any other open tab.

### Carousel question not identified

Open the question first. Try selecting the question text in the page before
running the extension. If the question is rendered only as an inaccessible
image or canvas, the text extraction may not be able to read it.

### ChatGPT opened, but the message composer was not available

Make sure ChatGPT has finished loading and that you are signed in. Check for
dialogs, login screens, or a changed composer layout. Reload the extension
after updating its files.

### ChatGPT response was not copied

The copy process waits for a new assistant response to stop generating and
remain unchanged for multiple checks. Keep the ChatGPT tab open, and make
sure the response completes within three minutes. If the page layout has
changed, the extension's response detection may no longer match it.

### A solver workflow still appears to be running

Open the extension popup and use **Cancel running workflow**. If the popup
was open and its controls are disabled, close and reopen it first. You can
also press **Ctrl+Shift+Y**. Then run the workflow again from the source tab.
Reload the extension from the browser extensions page if the workflow remains
stuck.

### Sparx did not advance

Confirm the Sparx page is active and the intended control has focus. The
extension dispatches Enter events to the currently focused element; the
website may ignore synthetic keyboard events or require a different focused
control.

### Screenshot was downloaded instead of attached

The extension did not find an enabled image file input on GauthMath. Open
GauthMath's image-upload control and attach the downloaded `Screenshot.png`
(or the uniquely named equivalent) manually.

### Cookies and cache could not be cleared

Use the action on a normal `http` or `https` page. Browser-internal pages,
extension pages, and other non-web pages do not have a clearable web origin.
Clearing site data reloads the current tab and may sign you out.

### Shortcut does not work

Check `chrome://extensions/shortcuts` for conflicts and confirm the shortcut
is assigned to this extension. You can use the popup buttons instead.

## Project files

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 metadata, permissions, popup, and default shortcuts. |
| `popup.html` | Popup interface and its buttons. |
| `popup.js` | Sends popup actions to the extension service worker and displays status. |
| `background.js` | Implements the solver workflows, tab handling, cancellation, site-data clearing, and answer-copy queue. |
| `README.md` | Documentation for installation, usage, behavior, and limitations. |

## Responsible use

I made this project to automate transferring a question to another service and
managing local site data. Review the selected question, screenshot, and
destination before submitting anything. Follow the relevant services' terms,
school rules, browser policies, and account limits. Clearing cookies or cache
is not a guarantee that an account-level or server-side restriction will
change.
