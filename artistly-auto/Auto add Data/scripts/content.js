let isRunning = false;

async function runAutomation(rows) {

    await waitForElements('[data-t="assets-content-grid"]');

    const max = rows.length;

    for (let i = 0; i < max; i++) {

        if (!isRunning) break;

        try {
            const items = document.querySelectorAll(
                '[data-t="assets-content-grid"] .container-inline-block'
            );

            if (!items[i]) break;

            console.log("Processing index:", items[i], "with data:", rows[i]);

            const row = rows[i];

            items[i].scrollIntoView({ behavior: "smooth", block: "center" });
            await delay(500);
            const clickable = items[i].querySelector("a, button, div[role='option']") || items[i];
            realClick(clickable);

            await delay(1000);

            // 🔥 STEP 1: Click first checkbox
            const aiCheckbox = await waitForElement(
                '#content-tagger-generative-ai-checkbox'
            );
            setCheckboxChecked(aiCheckbox, true);

            await delay(500); // allow UI update

            // 🔥 STEP 2: Click second checkbox
            const propertyCheckbox = await waitForElement(
                '#content-tagger-generative-ai-property-release-checkbox'
            );
            setCheckboxChecked(propertyCheckbox, true);

            await delay(500); // allow UI update


            const categoryBtn = await waitForElement(
                '[data-t="content-tagger-category-select"]'
            );

            realClick(categoryBtn);

            await delay(1000);

            // 🔥 STEP 4: Select category (robust)
            if (row.Category) {

                const targetCategory = row.Category.trim().toLowerCase();

                await delay(800); // allow dropdown render

                const options = document.querySelectorAll('[role="option"]');

                let found = false;

                for (const opt of options) {

                    const label = opt.querySelector('.gO9Mdq_spectrum-Menu-itemLabel');

                    if (!label) continue;

                    const text = label.innerText.trim().toLowerCase();

                    if (text === targetCategory) {
                        realClick(opt);
                        found = true;
                        console.log("✅ Selected category:", text);
                        break;
                    }
                }

                if (!found) {
                    console.warn("❌ Category not found:", row.Category);
                }

                await delay(800);
            }

            const titleBox = await waitForElement(
                'textarea[data-t="asset-title-content-tagger"]'
            );

            const keywordBox = await waitForElement(
                '#content-keywords-ui-textarea'
            );

            setNativeValue(titleBox, row.Title);
            setNativeValue(keywordBox, row.Keywords);

            document.getElementById("statusText").innerText =
                `Processing ${i + 1}/${max}`;

            await delay(2000);

        } catch (err) {
            console.error("Error at index", i, err);
        }
    }

    console.log("✅ Done automation");
}

function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(
        element.__proto__,
        "value"
    ).set;

    valueSetter.call(element, value);

    element.dispatchEvent(new Event("input", { bubbles: true }));
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function createFloatingUI() {
    const panel = document.createElement("div");

    panel.style.position = "fixed";
    panel.style.top = "20px";
    panel.style.right = "20px";
    panel.style.zIndex = "9999";
    panel.style.background = "#fff";
    panel.style.padding = "10px";
    panel.style.border = "1px solid #ccc";
    panel.style.borderRadius = "8px";
    panel.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";

    panel.innerHTML = `
        <input type="file" id="excelFile" accept=".xlsx,.csv"/><br><br>
        <button id="startAuto">▶ Start</button>
        <button id="stopAuto">⛔ Stop</button>
        <div id="statusText">Idle</div>
    `;

    document.body.appendChild(panel);

    document.getElementById("excelFile").addEventListener("change", handleFile);
    document.getElementById("startAuto").onclick = startAutomation;
    document.getElementById("stopAuto").onclick = stopAutomation;
}

createFloatingUI();

async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await delay(300);
    }

    throw new Error("Element not found: " + selector);
}


function realClick(el) {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function getData() {
    const result = await chrome.storage.local.get("excelData");
    return result.excelData || [];
}


async function startAutomation() {
    isRunning = true;

    const data = await getData();
    console.log("🔥 Loaded data:", data);

    if (!data.length) {
        alert("No data found! Please upload Excel first.");
        return;
    }

    runAutomation(data);
}


function stopAutomation() {
    isRunning = false;
    console.log("⛔ STOP clicked");
}

async function waitForElements(selector, timeout = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) return elements;
        await delay(500);
    }

    throw new Error("Elements not found: " + selector);
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


async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await delay(300);
    }

    throw new Error("Element not found: " + selector);
}