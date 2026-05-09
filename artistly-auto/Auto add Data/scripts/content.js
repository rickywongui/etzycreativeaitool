let isRunning = false;
let selectedImages = [];

function setNativeValue(element, value) {

    // ✅ CASE 1: input / textarea
    const descriptor = Object.getOwnPropertyDescriptor(
        element.__proto__,
        "value"
    );

    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return;
    }

    // ✅ CASE 2: contenteditable (Slate, div, etc.)
    if (element.isContentEditable) {
        element.innerText = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return;
    }

    // ❌ fallback
    console.warn("⚠️ Cannot set value for element:", element);
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function createFloatingUI() {
    const panel = document.createElement("div");

    panel.style.position = "fixed";
    panel.style.top = "120px";
    panel.style.right = "20px";
    panel.style.zIndex = "9999";
    panel.style.width = "260px";
    panel.style.background = "#ffffff";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 8px 30px rgba(0,0,0,0.12)";
    panel.style.fontFamily = "Inter, sans-serif";
    panel.style.overflow = "hidden";
    panel.style.border = "1px solid #eee";

    panel.innerHTML = `
        <div id="dragHeader" style="
            padding:12px;
            font-weight:600;
            font-size:14px;
            cursor:grab;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color:#fff;
            display:flex;
            justify-content:space-between;
            align-items:center;
        ">
            <span>🚀 Automation</span>
            <span style="font-size:12px;opacity:0.8;">v1.0</span>
        </div>

        <div style="padding:12px;display:flex;flex-direction:column;gap:10px;">

            <label style="font-size:12px;color:#666;">Upload Excel</label>
            <input id="excelFile" type="file" accept=".xlsx,.csv" style="
                border:1px solid #ddd;
                border-radius:6px;
                padding:6px;
                font-size:12px;
            ">

            <div style="display:flex;gap:8px;">
                <button id="startAuto" style="
                    flex:1;
                    background:#22c55e;
                    color:#fff;
                    border:none;
                    border-radius:6px;
                    padding:8px;
                    font-size:12px;
                    cursor:pointer;
                ">▶ Start</button>

                <button id="stopAuto" style="
                    flex:1;
                    background:#ef4444;
                    color:#fff;
                    border:none;
                    border-radius:6px;
                    padding:8px;
                    font-size:12px;
                    cursor:pointer;
                ">⛔ Stop</button>
            </div>

            <div id="statusText" style="
                font-size:12px;
                color:#555;
                background:#f9fafb;
                padding:6px;
                border-radius:6px;
                text-align:center;
            ">Idle</div>
        </div>
       
        
    `;



    ["startAuto", "stopAuto"].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.onmouseenter = () => btn.style.opacity = "0.9";
        btn.onmouseleave = () => btn.style.opacity = "1";
    });

    document.body.appendChild(panel);

    document.getElementById("excelFile").addEventListener("change", handleFile);
    document.getElementById("statusText").style.color = "#16a34a"; // running
    document.getElementById("statusText").style.color = "#ef4444"; // stopped

    setTimeout(() => {
        const startBtn = document.getElementById("startAuto");
        const stopBtn = document.getElementById("stopAuto");

        if (startBtn) startBtn.onclick = startAutomation;
        if (stopBtn) stopBtn.onclick = stopAutomation;
    }, 0);

    return panel;
}


function uploadFileDirect(file) {
    const input = document.querySelector('input[type="file"]');

    if (!input) {
        console.warn("❌ File input not found");
        return;
    }

    const dt = new DataTransfer();
    dt.items.add(file);

    input.files = dt.files;

    input.dispatchEvent(new Event("change", { bubbles: true }));

    console.log("📤 Uploaded:", file.name);
}

async function loadFlowByName(name) {
    const res = await fetch(
        chrome.runtime.getURL("scripts/mockup-flow.json")
    );

    const json = await res.json();

    const flow = json.flows.find(f => f.name === name);

    if (!flow) throw new Error("Flow not found: " + name);

    return flow;
}




async function waitForElement(selector, timeout = 15000) {
    const start = Date.now();
    const selectors = selector.split(",");

    while (Date.now() - start < timeout) {

        for (const sel of selectors) {
            const el = document.querySelector(sel.trim());
            if (el) return el;
        }

        await delay(300);
    }

    console.warn("⚠️ Element not found, fallback to ANY textarea");
}


function realClick(el) {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function getData() {
    return new Promise((resolve) => {
        chrome.storage.local.get("excelData", (result) => {
            resolve(result.excelData || []);
        });
    });
}


async function startAutomation() {

    isRunning = true;

    const data = await getData();

    console.log("🔥 Loaded data:", data);

    if (!data.length) {
        alert("No data found! Please upload Excel first.");
        return;
    }

    await runAutomation(data);
}

function stopAutomation() {
    isRunning = false;
    console.log("⛔ STOP clicked");
}


async function loadFlowByURL() {

    const url = window.location.href;

    const res = await fetch(
        chrome.runtime.getURL("scripts/mockup-flow.json")
    );

    const json = await res.json();

    // 🔥 find matching route
    const route = json.routes.find(r =>
        url.includes(r.url)
    );

    if (!route) {
        throw new Error("❌ No flow mapped for this URL");
    }

    // 🔥 find flow
    const flow = json.flows.find(f =>
        f.name === route.flow
    );

    if (!flow) {
        throw new Error("❌ Flow not found: " + route.flow);
    }

    console.log("✅ Using flow:", flow.name);

    return flow;
}


async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (event) {
        try {
            const workbook = XLSX.read(event.target.result, { type: "array" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet);

            chrome.storage.local.set({ excelData: data }, () => {
                console.log("✅ Data saved:", data);

                document.getElementById("statusText").innerText =
                    `Loaded ${data.length} rows`;
            });

        } catch (err) {
            console.error("❌ Excel parse error:", err);
        }
    };

    reader.readAsArrayBuffer(file);
}

chrome.storage.local.get("excelData").then(result => {
    console.log("🔥 Data inside content.js:", result.excelData);
});


function setCheckboxChecked(el, checked = true) {
    if (!el) return;

    if (el.checked !== checked) {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
}



async function executeFlow(flow, context = {}) {

    for (const step of flow.steps) {

        console.log("⚡ Running step:", step);

        switch (step.action) {

            case "wait":
                await delay(step.ms || 1000);
                break;

            case "click":
                await handleClick(step);
                break;

            case "type":
                await handleType(step, context);
                break;

            case "clickByText":
                await handleClickByText(step);
                break;

            case "select":
                await handleSelect(step);
                break;

            case "clickTab":
                await handleClickByText({ text: step.text });
                break;

            case "clickCard":
                await handleClickByText({ text: step.label });
                break;

            case "clickGridItem":
                await handleClickGridItem(context.index);
                break;

            case "setCheckbox":
                await handleCheckbox(step);
                break;

            case "selectByText":
                await handleSelectByText(step, context);
                break;

            case "slateInput":
                await handleSlateInput(step, context);
                break;

            default:
                console.warn("❌ Unknown action:", step.action);
        }
    }
}


async function handleType(step, context) {

    const el = await waitForElement(step.selector);

    let value = step.value || "";

    value = value.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        return context[key.trim()] || "";
    });

    console.log("VALUE:", value);

    // 🔥 CASE 1: input / textarea
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        setNativeValue(el, value);
        return;
    }

    // 🔥 CASE 2: contenteditable (Slate, Google Flow)
    if (el.isContentEditable) {

        el.focus();
        await delay(100);

        // 🔥 👉 USE simulateTyping HERE
        await simulateTyping(el, value);

        console.log("✅ Typed into contenteditable:", value);
        return;
    }

    console.warn("⚠️ Unsupported element type:", el);
}


async function simulateTyping(el, text) {

    for (const ch of text) {

        el.dispatchEvent(new KeyboardEvent("keydown", {
            key: ch,
            bubbles: true
        }));

        el.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: ch
        }));

        el.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: ch
        }));

        el.dispatchEvent(new KeyboardEvent("keyup", {
            key: ch,
            bubbles: true
        }));

        await delay(5);
    }
}

async function handleClickByText(step) {

    const elements = document.querySelectorAll("button, div, span");

    for (const el of elements) {
        if (el.innerText?.trim() === step.text) {
            realClick(el);
            return;
        }
    }

    console.warn("❌ Text not found:", step.text);
}


async function handleSelect(step) {

    const el = await waitForElement(step.selector);

    el.value = step.value;

    el.dispatchEvent(new Event("change", { bubbles: true }));
}


async function handleClickGridItem(index) {

    const items = document.querySelectorAll(
        '[data-t="assets-content-grid"] .container-inline-block'
    );

    const item = items[index];

    if (!item) throw new Error("Item not found");

    item.scrollIntoView({ behavior: "smooth", block: "center" });
    await delay(500);

    const clickable =
        item.querySelector("a, button, div[role='option']") || item;

    realClick(clickable);
}



async function handleCheckbox(step) {

    const el = await waitForElement(step.selector);

    if (el.checked !== step.value) {
        realClick(el);
    }
}


async function handleSelectByText(step, context) {

    const target = (context[step.value.replace(/[{}]/g, "")] || "")
        .trim()
        .toLowerCase();

    const options = document.querySelectorAll(step.selector);

    for (const opt of options) {

        const label = opt.innerText.trim().toLowerCase();

        if (label === target) {
            realClick(opt);
            return;
        }
    }

    console.warn("❌ Not found:", target);
}

async function runAutomation(rows) {

    const flow = await loadFlowByURL();

    for (let i = 0; i < rows.length; i++) {

        if (!isRunning) break;

        const row = rows[i];

        await executeFlow(flow, {
            Prompt: row.Prompt,
            Title: row.Title,
            Keywords: row.Keywords,
            Category: row.Category,
            index: i
        });

        document.getElementById("statusText").innerText =
            `Processing ${i + 1}/${rows.length}`;
    }

    console.log("✅ Done automation");
}


async function handleSlateInput(step, context) {

    const el = await waitForElement('[contenteditable="true"]');

    let value = step.value || "";

    value = value.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        return context[key.trim()] || "";
    });

    // 🔥 focus editor
    el.focus();

    await delay(100);

    // 🔥 clear content (robust)
    el.innerHTML = "";
    el.textContent = "";

    // 🔥 insert text (FAST + STABLE)
    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(el);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);

    const textNode = document.createTextNode(value);
    range.insertNode(textNode);

    // 🔥 move cursor to end
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // 🔥 trigger proper events (IMPORTANT)
    el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
    }));

    el.dispatchEvent(new Event("change", { bubbles: true }));

    console.log("✅ Slate input (fast mode):", value);
}

async function handleClick(step) {

    // ✅ exact icon + text
    if (step.icon && step.text) {

        const btn = findExactSendButton(step);

        if (btn) {
            console.log("✅ Clicking exact button:", btn);

            btn.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            await delay(300);

            realClick(btn);

            return;
        }

        console.warn("❌ Exact button not found");
    }

    // ✅ fallback selector
    if (step.selector) {

        const el = await waitForElement(step.selector);

        realClick(el);

        return;
    }

    console.warn("❌ Click target not found:", step);
}


function findExactSendButton(step) {

    const buttons = document.querySelectorAll("button");

    for (const btn of buttons) {

        const iconEl = btn.querySelector("i");
        const spans = btn.querySelectorAll("span");

        const hasIcon =
            iconEl?.textContent.trim() === step.icon;

        const hasLabel =
            Array.from(spans).some(s =>
                s.textContent.trim().toLowerCase() ===
                step.text.toLowerCase()
            );

        if (hasIcon && hasLabel) {
            return btn;
        }
    }

    return null;
}

let isDragging = false;
let offsetX = 0, offsetY = 0;

const panel = createFloatingUI();
const header = panel.querySelector("#dragHeader");

header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    panel.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    panel.style.left = (e.clientX - offsetX) + "px";
    panel.style.top = (e.clientY - offsetY) + "px";
    panel.style.right = "auto";
});

document.addEventListener("mouseup", () => {
    isDragging = false;
    panel.style.cursor = "grab";
});