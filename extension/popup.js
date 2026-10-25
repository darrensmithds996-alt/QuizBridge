const status = document.getElementById("status");
const buttons = [...document.querySelectorAll("button")];

document.getElementById("runSolver").addEventListener("click", () => {
  runAction("run-solver");
});

document.getElementById("clearSiteData").addEventListener("click", () => {
  runAction("clear-site-data");
});

document.getElementById("cancelSolver").addEventListener("click", () => {
  runAction("cancel-solver");
});

async function runAction(action) {
  buttons.forEach((button) => {
    button.disabled = true;
  });
  status.textContent = "Working…";

  try {
    const response = await chrome.runtime.sendMessage({ action });
    if (!response?.ok) {
      throw new Error(response?.error || "The action could not be completed.");
    }
    status.textContent = response.message;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}
