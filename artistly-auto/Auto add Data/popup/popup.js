document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("fileInput").addEventListener("click", async () => {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tab.id, {
            action: "OPEN_FILE_PICKER"
        });
    });
});