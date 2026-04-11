
// ==========================================
// Artistly Automation Background Script
// ==========================================

let lastPromptValue = null;

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    console.log("🚀 Running mockup automation 2");
    if (msg.type === "OPEN_ARTISTLY") {
        const URL = "https://app.artistly.ai/ai/image-designer-v6";

        chrome.tabs.query({}, tabs => {
            const tab = tabs.find(t => t.url?.startsWith(URL));

            const sendToTab = tabId => {
                chrome.tabs.sendMessage(tabId, {
                    type: "RUN_ARTISTLY_AUTOMATION",
                    prompt: msg.prompt
                });
            };

            if (tab) {
                chrome.tabs.update(tab.id, { active: true });
                chrome.windows.update(tab.windowId, { focused: true });
                sendToTab(tab.id);
            } else {
                chrome.tabs.create({ url: URL }, newTab => {
                    const listener = (id, info) => {
                        if (id === newTab.id && info.status === "complete") {
                            chrome.tabs.onUpdated.removeListener(listener);
                            sendToTab(newTab.id);
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });
            }
        });

        sendResponse({ ok: true });
        return true;
    }

    if (msg.type === "RUN_ARTISTLY_MOCKUP_AUTOMATION") {
        const URL = "https://app.artistly.ai/ai/image-designer-v6";

        chrome.tabs.query({}, tabs => {
            const tab = tabs.find(t => t.url?.startsWith("https://app.artistly.ai"));

            const sendToTab = tabId => {
                chrome.tabs.sendMessage(tabId, {
                    type: "RUN_ARTISTLY_MOCKUP_AUTOMATION",
                    prompt: msg.prompt
                });
            };

            if (tab) {
                chrome.tabs.update(tab.id, { active: true });
                chrome.windows.update(tab.windowId, { focused: true });
                sendToTab(tab.id);
            } else {
                chrome.tabs.create({ url: URL }, newTab => {
                    const listener = (id, info) => {
                        if (id === newTab.id && info.status === "complete") {
                            chrome.tabs.onUpdated.removeListener(listener);
                            sendToTab(newTab.id);
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });
            }
        });


        sendResponse({ ok: true });
        return true;
    }

    /* background.js */
    if (msg.type === "RUN_ARTISTLY_CLONE") {
        console.log("🚀 Clone requested");

        const URL = "https://app.artistly.ai/ai/image-designer-v6";

        function sendTo(tabId) {
            sendToArtistly(
                tabId,
                { type: "RUN_ARTISTLY_CLONE" },
                resp => {
                    console.log("📩 Clone responded:", resp);
                    sendResponse(resp || { ok: true });
                }
            );
        }


        try {
            chrome.tabs.query({}, tabs => {
                const existing = tabs.find(t =>
                    t.url?.includes("app.artistly.ai")
                );

                // -----------------------------------
                // CASE 1: tab already exists
                // -----------------------------------
                if (existing) {
                    console.log("🔎 Found existing Artistly tab:", existing.id);

                    chrome.tabs.update(existing.id, { active: true }, () => {
                        // force scroll immediately
                        chrome.scripting.executeScript({
                            target: { tabId: existing.id },
                            func: () => {
                                window.scrollTo({ top: 0, behavior: "instant" });
                                window.dispatchEvent(new Event("scroll"));
                            }
                        });

                        const listener = (id, info) => {
                            if (id !== existing.id) return;
                            if (info.status !== "complete") return;

                            chrome.tabs.onUpdated.removeListener(listener);
                            console.log("🟢 Existing tab ready");
                            sendTo(existing.id);
                        };

                        chrome.tabs.onUpdated.addListener(listener);
                    });

                    return;
                }


                // -----------------------------------
                // CASE 2: create a brand-new tab
                // -----------------------------------
                chrome.tabs.create({ url: URL }, newTab => {
                    if (!newTab?.id) {
                        sendResponse({ error: "Could not create tab" });
                        return;
                    }

                    console.log("🟣 New Artistly tab created:", newTab.id);

                    const listener = (id, info, tab) => {
                        if (id !== newTab.id) return;
                        if (info.status !== "complete") return;
                        if (!tab?.url?.includes("artistly.ai")) return;

                        chrome.tabs.onUpdated.removeListener(listener);

                        console.log("🟢 New tab fully loaded");
                        setTimeout(() => sendTo(newTab.id), 500);
                    };

                    chrome.tabs.onUpdated.addListener(listener);
                });
            });

        } catch (err) {
            console.error("💥 Clone handler crashed:", err);
            sendResponse({ error: err.message || "Unknown error" });
        }

        return true;
    }

    function sendToArtistly(tabId, message, done) {

        // Step 1: ping
        chrome.tabs.sendMessage(tabId, { type: "PING" }, resp => {
            if (chrome.runtime.lastError || !resp?.alive) {

                console.warn("No content script. Injecting…");

                chrome.scripting.executeScript(
                    {
                        target: { tabId },
                        files: ["content.js"]
                    },
                    () => {
                        if (chrome.runtime.lastError) {
                            console.error("Inject failed:", chrome.runtime.lastError);
                            done?.({ error: "Inject failed" });
                            return;
                        }

                        // retry message
                        chrome.tabs.sendMessage(tabId, message, done);
                    }
                );

                return;
            }

            // Step 2: already alive
            chrome.tabs.sendMessage(tabId, message, done);
        });
    }


    // ---------------------------------------
    // RUN ARTISTLY STYLE WORKFLOW
    // ---------------------------------------
    if (msg.type === "RUN_ARTISTLY_STYLE") {
        console.log("🎨 RUN_ARTISTLY_STYLE received");
        lastPromptValue = msg.prompt;

        const URL = "https://app.artistly.ai/ai/image-designer-v6";

        try {
            chrome.tabs.create({ url: URL }, tab => {
                if (!tab || !tab.id) {
                    console.error("❌ Could not create Artistly tab");
                    sendResponse({ error: "Could not create Artistly tab" });
                    return;
                }

                console.log("🟣 Artistly tab created:", tab.id);

                const listener = (id, info, changedTab) => {
                    if (id !== tab.id) return;
                    if (info.status !== "complete") return;
                    if (!changedTab?.url?.includes("artistly.ai")) return;

                    console.log("🟢 Artistly fully ready, injecting STEP1…");

                    chrome.tabs.onUpdated.removeListener(listener);

                    setTimeout(() => {
                        chrome.tabs.sendMessage(
                            tab.id,
                            {
                                type: "RUN_ARTISTLY_STYLE_STEP1",
                                prompt: lastPromptValue
                            },
                            resp => {
                                if (chrome.runtime.lastError) {
                                    console.warn(
                                        "❌ Content script not ready:",
                                        chrome.runtime.lastError
                                    );
                                    sendResponse({ error: "Content script not loaded" });
                                    return;
                                }

                                console.log("📩 Response from STEP1:", resp);
                                sendResponse(resp || { ok: true });
                            }
                        );
                    }, 700);
                };

                chrome.tabs.onUpdated.addListener(listener);
            });
        } catch (err) {
            console.error("💥 Style handler crashed:", err);
            sendResponse({ error: err.message || "Unknown crash" });
        }

        // tell Chrome we reply asynchronously
        return true;
    }

});


// ===========================================
// GLOBAL LISTENER: Continue after navigation
// ===========================================
chrome.tabs.onUpdated.addListener((id, info, tab) => {
    if (info.status !== "complete") return;
    if (!tab.url?.includes("/ai/ai-illustrator")) return;

    console.log("🔄 Illustrator page loaded, continuing STEP2…");

    chrome.tabs.sendMessage(id, {
        type: "RUN_ARTISTLY_STYLE_STEP2",
        prompt: lastPromptValue
    });
});

console.log("🧠 Background loaded");

function isAppTab(t) {
    try {
        const u = new URL(t.url || "");
        return (
            (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
            u.port === "3000"
        );
    } catch {
        return false;
    }
}

function sendToApp(tabId, value, attempt = 1) {
    // console.log(`📨 Sending clone result to app (attempt ${attempt})`);
    console.log(`📨 Sending clone result to app (attempt ${value})`);

    chrome.tabs.sendMessage(
        tabId,
        {
            type: "PASTE_CLONE_TO_APP",
            value
        },
        resp => {
            if (chrome.runtime.lastError) {
                console.warn(
                    "⚠ App not ready yet:",
                    chrome.runtime.lastError.message
                );

                if (attempt < 10) {
                    setTimeout(() => sendToApp(tabId, value, attempt + 1), 600);
                }
                return;
            }

            console.log("✨ App received:", resp);
        }
    );
}

// ===========================================
//  HANDLE CLONE RESPONSE FROM content.js
// ===========================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "CLONE_RESULT") return;

    console.log("📩 Clone result received in background:", msg.payload);

    chrome.tabs.query({}, tabs => {
        let appTab = tabs.find(isAppTab);

        // If not open, open it first
        if (!appTab) {
            console.log("🆕 Opening localhost:3000");

            chrome.tabs.create({ url: "http://localhost:3000" }, newTab => {
                chrome.tabs.onUpdated.addListener(function listener(id, info) {
                    if (id === newTab.id && info.status === "complete") {
                        chrome.tabs.onUpdated.removeListener(listener);

                        console.log("🌍 App loaded, sending text");
                        sendToApp(newTab.id, msg.payload);
                    }
                });
            });

            return;
        }

        // Already open
        console.log("🔎 Found existing app tab, sending text");
        chrome.tabs.update(appTab.id, { active: true });
        chrome.windows.update(appTab.windowId, { focused: true });

        sendToApp(appTab.id, msg.payload);
    });

    sendResponse({ ok: true });
    return true;
});


