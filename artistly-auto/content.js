console.log("🧩 Artistly content script loaded");



// GLOBAL automation controller


window.AUTOMATION = {
    cancel: false,
    runId: 0
};

window.stopAutomation = () => {
    console.log("⛔ Stopping all automation");
    window.AUTOMATION.cancel = true;
};


function guard(runId) {
    if (window.AUTOMATION.cancel || window.AUTOMATION.runId !== runId) {
        console.warn("⏹ Automation aborted (safe)");
        throw new Error("Automation cancelled (safe)");
    }
}



// ==============================
// Utilities (DECLARE ONCE)
// ==============================
// define only once, safely
if (typeof window.sleep === "undefined") {
    window.sleep = ms =>
        new Promise(r => setTimeout(r, ms));
}

if (typeof window.waitFor === "undefined") {
    window.waitFor = async (fn, label, timeout = 10000, runId = null) => {
        const start = Date.now();

        while (true) {

            // Only guard if runId is explicitly provided
            if (runId !== null) {
                guard(runId);
            }

            try {
                const el = fn();
                if (el) return el;
            } catch { }

            if (Date.now() - start > timeout) {
                throw new Error("Timeout waiting for " + label);
            }

            await window.sleep(300);
        }
    };
}



// ==============================
// Click Create From Prompt (ICON)
// ==============================
async function clickCreateFromPrompt() {
    const icon = await waitFor(
        () => {
            const label = [...document.querySelectorAll("div")]
                .find(d =>
                    d.textContent &&
                    d.textContent.replace(/\s+/g, " ").trim() === "Create From Prompt"
                );

            if (!label) return null;

            const group = label.closest(".group");
            if (!group) return null;

            return group.querySelector("svg")?.parentElement || null;
        },
        "Create From Prompt icon"
    );

    icon.scrollIntoView({ block: "center" });
    await sleep(300);

    ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
        icon.dispatchEvent(
            new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            })
        );
    });

    console.log("✅ Clicked Create From Prompt");
}

async function clickByCardLabel(labelText) {

    console.log(`🔍 Looking for: ${labelText}`);
    // 🌙 WAIT FIVE SECONDS BEFORE CLICK
    console.log("⏳ Waiting 2 seconds before clicking…");
    await sleep(2000);

    const target = await waitFor(
        () => {
            const label = [...document.querySelectorAll("div")]
                .find(d =>
                    d.textContent &&
                    d.textContent.replace(/\s+/g, " ").trim() === labelText
                );

            if (!label) return null;

            const group = label.closest(".group");
            if (!group) return null;
            return group.querySelector("button, svg, img")?.closest("button") ||
                group.querySelector("button, svg,img")?.parentElement ||
                null;
        },
        `Card button: ${labelText}`
    );

    if (!target) {
        console.warn(`❌ Could not find card button: ${labelText}`);
        return false;
    }

    // Ensure visibility
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    await sleep(250);

    // Re-query right before clicking (React sometimes remounts)
    const fresh = document.elementFromPoint(
        target.getBoundingClientRect().left + 5,
        target.getBoundingClientRect().top + 5
    )?.closest("button, .group");


    const clickable = fresh;
    const clickableTg = target;

    // Prefer native click
    try {
        clickable.click();
        clickableTg.click();
    } catch { }

    // Backup synthetic events
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        clickable.dispatchEvent(
            new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            })
        );
    }

    console.log(`🟢 Click dispatched: ${labelText}`);

    return true;
}



// ==============================
// DESIGN PROMPT AUTOMATION
// ==============================
async function runArtistlyAutomation(prompt, quantity = 4) {
    if (!prompt) throw new Error("Missing prompt");

    console.log("🚀 Running design prompt automation");

    // 1️⃣ Create From Prompt
    await clickByCardLabel("Create From Prompt");
    await sleep(800);

    // 2️⃣ Inject prompt
    const textarea = await waitFor(
        () => document.querySelector('textarea[placeholder="Enter prompt here"]'),
        "Prompt textarea"
    );

    textarea.focus();
    textarea.value = prompt;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    console.log("✍️ Prompt injected");

    // 3️⃣ Quantity → 4
    const qty = await waitFor(
        () => [...document.querySelectorAll("select")].find(s => s.value === "1"),
        "Quantity select"
    );

    qty.value = String(quantity);
    qty.dispatchEvent(new Event("change", { bubbles: true }));
    console.log("🔢 Quantity set to 4");

    // 4️⃣ High Quality
    const hqBtn = await waitFor(
        () => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "High Quality"),
        "High Quality button"
    );
    hqBtn.click();

    // 5️⃣ Generate
    const genBtn = await waitFor(
        () => document.getElementById("generate_image_flux"),
        "Generate button"
    );
    genBtn.click();

    console.log("🎨 Image generation started");
}

// ==============================
// MOCKUP AUTOMATION (ETSY FLOW)
// ==============================
async function runMockupAutomation(prompt) {
    try {
        console.log("🚀 Running mockup automation");

        // 1️⃣ AI Design Assistants
        const aiAssist = await waitFor(
            () => {
                const container = document.getElementById("AI Design Assistants3");
                if (!container) return null;

                return container.querySelector("a");
            },
            "AI Design Assistants container"
        );

        aiAssist.scrollIntoView({ block: "center" });
        aiAssist.click();

        await sleep(1500);

        // 2️⃣ Mockup Creator
        const mockupCard = await waitFor(
            () => {
                const label = [...document.querySelectorAll("div")]
                    .find(d =>
                        d.textContent &&
                        d.textContent.replace(/\s+/g, " ").trim() === "Mockup Creator"
                    );

                if (!label) return null;

                const group = label.closest(".group");
                if (!group) return null;

                return group.querySelector("div.relative");
            },
            "Mockup Creator card"
        );

        // Real user-like click
        mockupCard.scrollIntoView({ block: "center" });

        ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
            mockupCard.dispatchEvent(
                new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
        });
        await sleep(10000);

        // 3️⃣ Wait for uploaded design
        await waitFor(
            () => document.querySelector(".filepond--image-preview canvas"),
            "Uploaded design preview"
        );

        // 4️⃣ Quantity → 4
        const qty = await waitFor(
            () => [...document.querySelectorAll("select")].find(s => s.value === "1"),
            "Mockup quantity select"
        );
        qty.value = "1";
        qty.dispatchEvent(new Event("change", { bubbles: true }));

        // 5️⃣ Prompt
        const textarea = await waitFor(
            () =>
                document.querySelector(
                    'textarea[placeholder="Example: Photo of woman wearing t-shirt, t-shirt has a logo on it"]'
                ),
            "Mockup prompt textarea"
        );

        textarea.focus();
        textarea.value = prompt;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));

        // 6️⃣ Generate
        const genBtn = await waitFor(
            () => document.getElementById("generate_image_flux"),
            "Generate mockup button"
        );
        genBtn.click();

        console.log("🎉 Mockup generation started");

    } catch (err) {
        console.error("❌ Mockup automation failed:", err);
        alert("Mockup automation failed:\n" + err.message);
    }
}



async function runMockupAutomationNewModal(prompt) {
    try {
        console.log("🚀 Running mockup automation old");
        // stop running automations
        window.AUTOMATION.cancel = true;

        await sleep(2000);

        // allow automation again
        window.AUTOMATION.cancel = false;

        const runId = ++window.AUTOMATION.runId;

        // 1️⃣ AI Design Assistants
        await clickTabText("AI Image Designer v6");

        await sleep(1500);

        // 2️⃣ Mockup Creator
        await clickByCardLabel("Seamless Patterns V2", runId);

        await sleep(1000);

        // 5️⃣ Prompt
        const textarea = await waitFor(
            () =>
                document.querySelector(
                    'textarea[placeholder="A seamless pattern of ..."]'
                ),
            "Mockup prompt textarea"
        );

        textarea.focus();
        textarea.value = prompt;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));

        // 6️⃣ Generate
        const genBtn = await waitFor(
            () => document.getElementById("generate_image_flux"),
            "Generate mockup button"
        );
        genBtn.click();

        console.log("🎉 Mockup generation started");

    } catch (err) {
        console.error("❌ Mockup automation failed:", err);
        alert("Mockup automation failed:\n" + err.message);
    }
}



async function openDesigner() {
    window.location.href = "https://app.artistly.ai/ai/image-designer-v6";
    await sleep(2000);
}

async function clickTextButton(text) {
    const btn = await waitFor(
        () =>
            [...document.querySelectorAll("button, div, span, a")]
                .find(b => b.textContent?.trim() === text),
        `Button: ${text}`
    );

    btn.scrollIntoView({ block: "center" });

    ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
        btn.dispatchEvent(
            new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            })
        );
    });

    await sleep(600);
}

async function clickTabText(label, timeout = 20000) {

    // find <a> that contains our text
    const link = [...document.querySelectorAll("a")]
        .find(a => a.textContent.trim().includes(label));

    if (!link) {
        throw new Error(`Link with text "${label}" not found`);
    }

    // scroll into view (prevents weird “needs scroll” issues)
    link.scrollIntoView({ behavior: "smooth", block: "center" });

    // simulate a real user click
    ["pointerdown", "mousedown", "mouseup", "click"].forEach(evt => {
        link.dispatchEvent(
            new MouseEvent(evt, { bubbles: true, cancelable: true, view: window })
        );
    });

    // wait for navigation / page load
    await waitForNavigation(timeout);
}

function waitForNavigation(timeout = 20000) {
    return new Promise((resolve, reject) => {

        const start = Date.now();

        function check() {
            if (document.readyState === "complete") {
                return resolve();
            }

            if (Date.now() - start > timeout) {
                return reject(new Error("Navigation timeout"));
            }

            requestAnimationFrame(check);
        }

        check();
    });
}


function whenReady() {
    return new Promise(res => {
        if (document.readyState === "complete") return res();
        window.addEventListener("load", () => res(), { once: true });
    });
}

window.safeWaitFor = async (fn, label, timeout = 20000, runId = null) => {
    try {
        return await window.waitFor(fn, label, timeout, runId);
    } catch (e) {
        console.warn("Ignoring wait error:", label, e.message);
        return null;   // <- continue automation instead of crashing
    }
};


// ==============================
// MESSAGE HANDLERS (ONLY ONCE)
// ==============================

if (!window.__ARTISTLY_LISTENER__) {
    window.__ARTISTLY_LISTENER__ = true;

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

        if (msg.type === "PING") {
            // let background know we are alive
            sendResponse({ alive: true });
            return true;
        }

        if (msg.type === "RUN_ARTISTLY_AUTOMATION") {
            const quantity = msg.quantity ?? 4; // default fallback

            runArtistlyAutomation(msg.prompt, quantity)
                .then(() => sendResponse({ ok: true }))
                .catch(err => sendResponse({ error: String(err) }));

            return true;
        }

        if (msg.type === "RUN_ARTISTLY_MOCKUP_AUTOMATION") {
            console.log("🚀 Running mockup automation 1");
            runMockupAutomation(msg.prompt)
                .then(() => sendResponse({ ok: true }))
                .catch(err => sendResponse({ error: String(err) }));
            return true;
        }

        if (msg.type === "RUN_ARTISTLY_MOCKUP_NEWMODAL") {

            runFlowByName("mockup_v1", {
                prompt: msg.prompt
            })
                .then(() => sendResponse({ ok: true }))
                .catch(err => sendResponse({ error: String(err) }));

            return true;
        }

        if (msg.type === "RUN_ARTISTLY_PROMPT_NEWMODAL") {

            runFlowByName("mockup_v1", {
                prompt: msg.prompt
            })
                .then(() => sendResponse({ ok: true }))
                .catch(err => sendResponse({ error: String(err) }));

            return true;
        }

        if (msg.type === "RUN_ARTISTLY_SEAMLESS_AUTOMATION") {

            runFlowByName("seamless_v1", {
                prompt: msg.prompt
            })
                .then(() => sendResponse({ ok: true }))
                .catch(err => sendResponse({ error: String(err) }));

            return true;
        }


        if (msg.type === "RUN_ARTISTLY_CLONE") {
            console.log("🚀 Running clone automation 2");

            (async () => {

                // stop running automations
                window.AUTOMATION.cancel = true;

                await sleep(2000);

                // allow automation again
                window.AUTOMATION.cancel = false;

                const runId = ++window.AUTOMATION.runId;

                try {
                    guard(runId);
                    await whenReady(runId);

                    // wait for that annoying error script to finish loading
                    await waitForAnnoyingErrorThenContinue();
                    await clickTabText("AI Image Designer v6");
                    await sleep(2000);
                    // continue with your existing automation here

                    // await clickCreateFromPrompt(runId);
                    await clickByCardLabel("Create From Prompt", runId);
                    await clickTextButton("Mirror Magic");

                    const canvas = await safeWaitFor(
                        () => document.querySelector(".filepond--image-preview canvas"),
                        "Mirror Magic canvas",
                        20000,
                        runId
                    );

                    // If canvas missing, just continue
                    if (!canvas) {
                        console.log("⚠️ No Mirror Magic canvas detected, continuing anyway…");
                    }


                    const uploadDone = await waitFor(
                        () => {
                            const el = document.querySelector(".filepond--file-status-main");
                            if (!el) return null;

                            const visible =
                                el.offsetParent !== null &&
                                window.getComputedStyle(el).display !== "none" &&
                                window.getComputedStyle(el).visibility !== "hidden";

                            const txt = el.textContent.trim().toLowerCase();
                            return visible && txt.includes("upload complete") ? el : null;
                        },
                        "Visible upload-complete status"
                    );

                    console.log("✅ Image uploaded:", canvas, uploadDone);
                    await sleep(300);

                    await clickDescribeButton();


                    const extracted = await waitFor(
                        () => {
                            const label = [...document.querySelectorAll("p")]
                                .find(p => p.textContent?.trim() === "Extracted Prompt");
                            return label?.parentElement?.querySelector("textarea") || null;
                        },
                        "Extracted prompt textarea", 50000, runId
                    );

                    await navigator.clipboard.writeText(extracted.value);
                    await clickTextButton("Use Prompt");
                    console.log("✨ Extracted prompt copied");

                    chrome.runtime.sendMessage(
                        {
                            type: "CLONE_RESULT",
                            payload: extracted.value
                        },
                        resp => {
                            console.log("📥 Background responded:", resp, chrome.runtime.lastError);
                        }
                    );

                    sendResponse({ ok: true });
                    guard(runId);

                } catch (err) {

                    if (String(err.message).includes("Automation cancelled")) {
                        console.log("⏸ Clone stopped intentionally. Not an error.");
                        sendResponse({ ok: true });
                        return;
                    }

                    console.error("Clone automation failed:", err);
                    sendResponse({ error: err.message });
                }
            })();

            return true;
        }

        if (msg.type === "RUN_ARTISTLY_MIX") {
            console.log("🚀 Running mix RUN_ARTISTLY_MIX");
            (async () => {
                // stop running automations
                window.AUTOMATION.cancel = true;

                await sleep(2000);

                // allow automation again
                window.AUTOMATION.cancel = false;

                const runId = ++window.AUTOMATION.runId;

                try {
                    console.log("🚀 Running mix ARTISTLY_MIX 2");
                    guard(runId);
                    await whenReady(runId);

                    // wait for that annoying error script to finish loading
                    await waitForAnnoyingErrorThenContinue();
                    await clickTabText("AI Image Designer v6");
                    // continue with your existing automation here
                    // click "T-Shirt Designs"
                    await sleep(2000);
                    await clickByCardLabel("T-Shirt Designs", runId);

                    // wait textarea with prompt text
                    const box = await waitFor(
                        () => [...document.querySelectorAll("textarea")]
                            .find(t => t.placeholder?.includes("Enter prompt here") && t.value?.length),
                        "artistly tshirt textarea", 100000, runId
                    );

                    const text = box.value.trim();

                    console.log("🎨 MIX TEXT:", text);

                    // send back to our app

                    chrome.runtime.sendMessage(
                        {
                            type: "MIX_APPEND",
                            payload: text
                        },
                        resp => {
                            console.log("📥 Background responded:", text, chrome.runtime.lastError);
                        }
                    );

                    console.log("✨ Extracted prompt copied");

                    sendResponse({ ok: true });
                    guard(runId);

                } catch (err) {
                    console.error("Mix failed", err);
                }
            })();

            return true;
        }



        function waitForAnnoyingErrorThenContinue(timeout = 1000) {
            return new Promise(resolve => {
                let done = false;

                const finish = () => {
                    if (done) return;
                    done = true;
                    window.removeEventListener("error", onErr, true);
                    resolve();
                };

                // Watch network / script load errors
                function onErr(e) {
                    const msg = String(e?.filename || e?.message || "").toLowerCase();

                    if (msg.includes("dtscout")) {
                        console.log("⚠️ Tracking script failed (safe to ignore)");
                        finish();
                    }
                }

                window.addEventListener("error", onErr, true);

                // Fallback: continue anyway after timeout
                setTimeout(finish, timeout);
            });
        }


        async function clickDescribeButton() {
            const btn = await waitFor(
                () =>
                    [...document.querySelectorAll('button[type="submit"]')]
                        .find(b =>
                            b.textContent?.trim().toLowerCase() === "describe"
                        ),
                "Describe submit button"
            );

            btn.scrollIntoView({ block: "center" });

            ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
                btn.dispatchEvent(
                    new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })
                );
            });

            await sleep(400);
        }


        if (msg.type === "PASTE_CLONE_TO_APP") {
            console.log("✨ Appending variation:", msg.value);
            const box = document.getElementById("variationInput");
            const boxAdobe = document.getElementById("cloneprompt");
            const boxmockup = document.getElementById("mockupCloneBox");

            if (box) {
                box.value = msg.value;
                box.dispatchEvent(new Event("input", { bubbles: true }));
                console.log("✨ Clone text pasted into variationInput");
            }

            if (boxAdobe) {
                boxAdobe.value = msg.value;
                boxAdobe.dispatchEvent(new Event("input", { bubbles: true }));
                console.log("✨ Clone text pasted into cloneprompt");
            }

            if (boxmockup) {
                boxmockup.value = msg.value;
                boxmockup.dispatchEvent(new Event("input", { bubbles: true }));

                console.log("✨ Clone Mockup text pasted into variationInput");
            }
        }

        if (msg.type === "APPEND_VARIATION") {
            console.log("✨ Appending variation:", msg.value);

            const box = document.getElementById("variationInput");
            const boxChoose = document.getElementById("aiDesignPromptText");

            if (!box) return;

            const current = (box.value || "").trim();

            // If EMPTY → paste into boxChoose instead
            if (!current && boxChoose) {

                const setter =
                    Object.getOwnPropertyDescriptor(
                        Object.getPrototypeOf(boxChoose),
                        "value"
                    ).set;

                setter.call(boxChoose, msg.value);

                boxChoose.dispatchEvent(new Event("input", { bubbles: true }));
                console.log("✨ First variation added to boxChoose");
                return;
            }

            // Otherwise → append to main textarea (old flow)
            const next = current
                ? current + "\n\n" + msg.value
                : msg.value;

            const setter =
                Object.getOwnPropertyDescriptor(
                    Object.getPrototypeOf(box),
                    "value"
                ).set;

            setter.call(box, next);

            box.dispatchEvent(new Event("input", { bubbles: true }));

            console.log("✨ Mixed style appended (React-safe)");
        }



        if (msg.type === "RUN_ARTISTLY_STYLE_STEP1") {
            console.log("🎨 STEP 1: Click Illustrator");

            (async () => {
                const illustratorCard = await waitFor(
                    () => document.querySelector('div[id^="AI Art Illustrator"] a'),
                    "Illustrator link"
                );

                await clickNode(illustratorCard);
            })();

            return true;
        }


        if (msg.type === "RUN_ARTISTLY_STYLE_STEP2") {
            console.log("🎨 STEP 2: Fill + Generate");

            const quantity = msg.quantity ?? 4; // 👈 NEW (fallback)

            (async () => {
                const textarea = await waitFor(
                    () =>
                        [...document.querySelectorAll("textarea")]
                            .find(t => t.placeholder?.includes("Enter prompt here")),
                    "Prompt textarea"
                );

                textarea.value = msg.prompt;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));

                const qty = await waitFor(
                    () =>
                        [...document.querySelectorAll("select")]
                            .find(s => [...s.options].some(o => o.value === "1")),
                    "Quantity select"
                );

                // 👇 dynamic quantity
                qty.value = String(quantity);
                qty.dispatchEvent(new Event("change", { bubbles: true }));

                console.log(`🔢 Quantity set to ${quantity}`);

                const btn = await waitFor(
                    () =>
                        [...document.querySelectorAll("button")]
                            .find(b => b.textContent?.trim() === "Generate Image"),
                    "Generate Button"
                );

                await clickNode(btn);

                console.log("🚀 Done generating images");
            })();

            return true;
        }
    });
}


async function clickNode(node) {
    ["pointerdown", "mousedown", "mouseup", "click"].forEach(e =>
        node.dispatchEvent(new MouseEvent(e, { bubbles: true }))
    );
}




// ==============================
// Automation Flow Click
// ==============================


async function runFlow(flow, context = {}) {

    console.log("🚀 Running flow:", flow.name);

    for (const step of flow.steps) {

        console.log("➡️ Step:", step);

        if (window.AUTOMATION?.cancel) {
            throw new Error("Automation cancelled");
        }

        try {

            switch (step.action) {

                case "wait":
                    console.log("⏳ wait", step.ms);
                    await sleep(step.ms);
                    break;

                case "click": {

                    let el = null;

                    // support selector OR selectors
                    const selectorList = Array.isArray(step.selectors)
                        ? step.selectors
                        : [step.selector];

                    for (const sel of selectorList) {
                        if (!sel) continue;

                        el = document.querySelector(sel);

                        if (el) {
                            console.log("✅ Found element:", sel);
                            break;
                        }
                    }

                    if (!el) {
                        throw new Error("❌ No selector matched");
                    }

                    // handle closest
                    if (step.target?.startsWith("closest:")) {
                        const tag = step.target.split(":")[1];
                        const parent = el.closest(tag);

                        if (!parent) {
                            throw new Error(`❌ closest(${tag}) not found`);
                        }

                        el = parent;
                    }

                    // safety check
                    if (typeof el.click !== "function") {
                        console.error("Invalid click target:", el);
                        throw new Error("Element is not clickable");
                    }

                    el.click();

                    break;
                }

                case "clickByText": {

                    const el = await waitFor(() => {
                        return [...document.querySelectorAll("button")]
                            .find(b =>
                                b.textContent
                                    ?.toLowerCase()
                                    .includes(step.text.toLowerCase())
                            );
                    }, `button text: ${step.text}`);

                    if (!el) {
                        console.error("Available buttons:",
                            [...document.querySelectorAll("button")]
                                .map(b => b.textContent)
                        );
                        throw new Error(`Button not found: ${step.text}`);
                    }

                    console.log("✅ Clicking:", el.textContent);

                    el.click();

                    break;
                }

                case "select": {

                    const el = await waitFor(
                        () => document.querySelector(step.selector),
                        step.selector
                    );

                    if (!el) {
                        throw new Error("Select not found");
                    }

                    el.value = step.value;

                    // trigger React / UI updates
                    el.dispatchEvent(new Event("change", { bubbles: true }));

                    console.log("✅ Selected:", step.value);

                    break;
                }

                case "clickTab":
                    console.log("🧭 clickTab", step.text);
                    await clickTabText(step.text);
                    break;

                case "clickCard":
                    console.log("🧩 clickCard", step.label);
                    await clickByCardLabel(step.label);
                    break;

                case "type":
                    console.log("⌨️ type", step.selector);

                    const el = await waitFor(
                        () => document.querySelector(step.selector),
                        step.selector
                    );

                    const value = interpolate(step.value, context);

                    el.focus();

                    const setter =
                        Object.getOwnPropertyDescriptor(
                            HTMLTextAreaElement.prototype,
                            "value"
                        ).set;

                    setter.call(el, value);

                    el.dispatchEvent(
                        new Event("input", { bubbles: true })
                    );

                    break;

                case "waitFor":
                    console.log("⏳ waitFor", step.selector);
                    await waitFor(
                        () => document.querySelector(step.selector),
                        step.selector
                    );
                    break;

                default:
                    console.warn("Unknown step:", step);
            }

        } catch (err) {

            console.error("❌ Step failed:", step, err);
            throw err;

        }
    }

    console.log("🎉 Flow completed");
}

function interpolate(template, context) {

    return template.replace(
        /\{\{(.*?)\}\}/g,
        (_, key) => context[key.trim()] ?? ""
    );

}


async function runFlowByName(flowName, context = {}) {

    console.log("🚀 Loading flow:", flowName);

    const url =
        chrome.runtime.getURL("mockup-flow.json");

    const res = await fetch(url);
    const data = await res.json();

    if (!data.flows || !Array.isArray(data.flows)) {
        throw new Error("Invalid flow file structure");
    }

    const flow = data.flows.find(
        f => f.name === flowName
    );

    if (!flow) {
        throw new Error(
            "Flow not found: " + flowName
        );
    }

    console.log("✅ Flow found:", flow.name);

    await runFlow(flow, context);
}