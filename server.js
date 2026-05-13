// server.js
// Node + Express backend to proxy AI requests to OpenAI securely.
// Usage: set OPENAI_API_KEY in .env and run `node server.js` (or use nodemon)

// upload to drive
import dotenv from 'dotenv';
dotenv.config();

// const app = express();

// import fs from "fs";
// import path from "path";
import archiver from "archiver";
import {
    v4 as uuidv4
} from "uuid";
import multer from "multer";
const upload = multer({
    dest: "temp_uploads/"
});



import express from "express";
import cors from "cors";
import {
    uploadToDrive,
    createDriveFolder,
    getAuthUrl,
    handleOAuthCallback
} from "./drive.js";
import {
    isDriveReady
} from "./drive.js";
import {
    findFolderByName
} from "./drive.js";


// import axios from 'axios';

import path from "path";
import puppeteer from "puppeteer";
import {
    fileURLToPath
} from "url";

import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});



function todayFolder() {
    const d = new Date();
    return d.toISOString().slice(0, 10); // 2026-01-12
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dotenv.config();

const app = express();
app.use("/images", express.static(path.join(process.cwd(), "images")));



// OPTIONAL – only if you want backend to serve your HTML file
app.get("/auth/google", (req, res) => {
    res.redirect(getAuthUrl());
});

app.get("/auth/google/callback", async (req, res) => {
    await handleOAuthCallback(req.query.code);
    res.redirect("/");
});


app.use(express.static("public"));
app.use(express.json());


console.log("Loaded API key:", !!process.env.OPENAI_API_KEY);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
    console.error('Missing OPENAI_API_KEY in env');
    process.exit(1);
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini'; // stable general-purpose model

async function callOpenAI(messages, max_tokens = 1200, jsonSchemaWrapper = null) {
    try {
        const payload = {
            model: DEFAULT_MODEL || "gpt-4o-mini",
            messages,
            max_tokens,
            temperature: 0.7
        };

        // Only attach response_format when explicitly passed
        if (jsonSchemaWrapper) {
            payload.response_format = {
                type: "json_schema",
                json_schema: jsonSchemaWrapper
            };
        }

        const resp = await openai.chat.completions.create(payload);
        return resp;
    } catch (err) {
        console.error("OpenAI SDK error:", err?.response?.data ?? err.message);
        throw err;
    }
}



/* ---------- Endpoints ---------- */

/*
POST /api/ai/keywords
Body: { niche: "dog mom" }
Response: { ... niche report ... }
*/

app.post('/api/ai/keywords', async (req, res) => {
    try {
        const {
            niche
        } = req.body;
        if (!niche) return res.status(400).json({
            error: "Missing niche"
        });

        const system = `You are a senior ecommerce strategist specializing in Print-on-Demand, Etsy, Redbubble, and Amazon Merch. Your job is to evaluate profitability, demand, and creative direction realistically — not hype.`;

        const user = `
        Analyze the following niche with forward-looking intent:
        
        "${niche}"
        
        Your goal is to determine whether this niche has strong SALES POTENTIAL specifically within the NEXT 2 MONTHS.
        
        Think like a Print-on-Demand strategist using:
        - seasonal purchase behavior
        - predictable holidays & events
        - trending aesthetics on TikTok, Instagram, Pinterest, Etsy, Reddit
        - cyclical consumer interest patterns
        - recent spikes in search & social data
        - viral social media themes
        - emerging pop culture moments
        - upcoming movie / TV releases
        - sports seasons & fandom cycles
        - cultural conversation patterns
        - emotional “gift buying” triggers
        - recurring bestsellers from previous years
        
        DO NOT invent fake statistics. Infer based on logic and past observable ecommerce patterns.
        
        SCORING RULES:
        0–39 = Weak short-term potential
        40–59 = Niche may sell but risky
        60–79 = Strong opportunity if executed well
        80–100 = High-probability seller within 60 days
        
        RETURN JSON ONLY in this exact structure:
        
        {
          "niche": "",
          "score": 0,
          "summary": "",
          "why_now": "",
          "demand": "",
          "competition": "",
          "risk_flags": [],
          "recommended_audience": [],
          "works_best_on": [],
          "design_angles": [],
          "micro_niches": [],
          "keywords": {
            "buyer_intent": [],
            "discovery": [],
            "long_tail": []
          }
        }
        
        FIELD RULES:
        
        "why_now":
        Explain clearly WHY this niche is likely to sell in the next 2 months. Reference predictable events such as holidays, school seasons, weather changes, gifting seasons, sports seasons, pop aesthetics, etc.
        
        "design_angles":
        Give angles that emotionally connect with buyers (love, humor, pride, nostalgia, identity, hobbies, jobs, family roles).
        
        "risk_flags":
        Include trademark, oversaturation, banned topics, complex licensing themes if any.
        `;


        const data = await callOpenAI(
            [{
                role: "system",
                content: system
            },
            {
                role: "user",
                content: user
            }
            ],
            900
        );

        const text = data?.choices?.[0]?.message?.content ?? "";
        let parsed = null;

        try {
            parsed = JSON.parse(text);
        } catch {
            // try extract JSON if wrapper text appears
            const m = text.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
        }

        if (!parsed || !parsed.niche) {
            return res.status(500).json({
                error: "Unexpected AI response format",
                raw: text
            });
        }

        res.json(parsed);

    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: "AI error",
            detail: err?.response?.data ?? err.message
        });
    }
});


app.post("/api/ai/suggest-niches", async (req, res) => {
    try {
        const prompt = `
  Today's date is ${new Date().toISOString().slice(0, 10)}.
  You are a senior ecommerce strategist specializing in Print-on-Demand, Etsy, Redbubble, and Amazon Merch.
  Your job is to evaluate profitability, demand, and creative direction realistically — not hype.

  Generate 15 ecommerce niches likely to perform well on Etsy / POD in the next 60 days.

  Think like a Print-on-Demand strategist using:
    - seasonal purchase behavior
    - predictable holidays & events
    - trending aesthetics on TikTok, Instagram, Pinterest, Etsy, Reddit
    - cyclical consumer interest patterns
    - recent spikes in search & social data
    - viral social media themes
    - emerging pop culture moments
    - upcoming movie / TV releases
    - sports seasons & fandom cycles
    - cultural conversation patterns
    - emotional “gift buying” triggers
    - recurring bestsellers from previous years
  
  Rules:
  - short phrases (1–3 words)
  - clear audiences
  - mix of evergreen + seasonal
  - avoid trademarked brands
  
  For each niche, return:
  - niche
  - score (0–100, demand vs competition)
  - reason (why it's promising)
  
  Return JSON ONLY:
  {
    "niches": [
      { "niche":"", "score":0, "reason":"" }
    ]
  }
  `;

        const data = await callOpenAI(
            [{
                role: "system",
                content: "You evaluate ecommerce niches realistically."
            },
            {
                role: "user",
                content: prompt
            }
            ],
            900
        );

        const text = data.choices?.[0]?.message?.content ?? "";

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
        }

        res.json(parsed);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "AI error",
            detail: err.message
        });
    }
});




/*
POST /api/ai/ideas
Body: { keyword: "cat" }
Response: { ideas: [ ... ] }
*/
app.post('/api/ai/ideas', async (req, res) => {
    try {
        const {
            keyword
        } = req.body;
        if (!keyword) return res.status(400).json({
            error: 'Missing keyword'
        });

        const system = `You are a creative product copywriter that writes short, catchy phrases for T-shirts, stickers and posters.`;
        const user = `
       You are a professional print-on-demand designer, trend researcher, and slogan creator.

Your job: Create 20 ORIGINAL design phrases inspired by the keyword:

"${keyword}"

These phrases are for real POD products (t-shirts, mugs, posters, stickers, wall art).

They should feel like ideas people actually want to wear, gift, or share.

---------------------------------
INSPIRATION SOURCES (STYLE ONLY)
---------------------------------
Take subtle creative inspiration from:
- trending design vibes on Kittl, Behance, Dribbble
- communities on Reddit (design, humor, lifestyle)
- current internet culture & social media language
- light nostalgic references (general era vibes, not specific IP)

Do NOT copy slogans.
Do NOT reference specific movies, brands, celebrities, quotes, or copyrighted titles.

We want “inspired by the culture,” not plagiarism.


────────────────────────
ILLUSTRATION IDEAS
────────────────────────
Generate 10 short illustration concepts that visually match the keyword and phrase vibe.

They should be simple, printable, and commercially usable.
Example styles: characters, symbols, emblems, scenes, silhouettes, icons.

Keep them concise (2–6 words each).

────────────────────────
SUB PHRASES (SECONDARY TEXT)
────────────────────────
Generate 10 short complementary phrases that could sit below or around main phrases.

They should feel supportive, emotional, fun, or stylish.
Keep them short (2–5 words).

---------------------------------
QUALITY RULES
---------------------------------
Every phrase must:
- sound natural, modern, and human
- feel giftable or personal
- stay short enough for print (3–8 words preferred)
- clearly relate to the keyword theme
- avoid repeating wording across phrases
- avoid generic clichés like “Just Breathe” or “Live Laugh Love”
- avoid trademark & copyright risk
- avoid emojis, hashtags, and ALL CAPS

Avoid excessive symbols, punctuation, or long sentences.

---------------------------------
CATEGORY RULES
---------------------------------
Evenly split phrases across categories:

cute
funny
vintage
minimal
witty

≈ 4 per category | total 20 phrases.

Cute = wholesome, sweet, heart warming  
Funny = playful humor without insult  
Vintage = nostalgic tone, retro personality  
Minimal = clean, aesthetic, few words  
Witty = clever wordplay that feels natural


────────────────────────
SCORING RULES
────────────────────────
Assign each phrase a realistic score from 40 to 100 based on:

• giftability
• emotional impact
• trend potential
• print clarity
• originality

Higher score = stronger commercial POD potential.

Do NOT reuse the same score repeatedly.
Vary scores naturally like real human judgment.



---------------------------------
WHAT TO AVOID
---------------------------------
No references to:
- Disney, Marvel, Pixar, anime, games, movies
- song lyrics or quotes
- political statements
- offensive humor
- explicit content


---------------------------------
OUTPUT FORMAT (JSON ONLY)
---------------------------------
Return JSON ONLY. No comments. No Markdown. No explanations.

{
  "ideas": {
    "cute": [{"text": "", "score": 0}],
    "funny": [{"text": "", "score": 0}],
    "vintage": [{"text": "", "score": 0}],
    "minimal": [{"text": "", "score": 0}],
    "witty": [{"text": "", "score": 0}]
  },
    "illustrations": [],
    "subPhrases": []
}


        `;


        const data = await callOpenAI([{
            role: 'system',
            content: system
        },
        {
            role: 'user',
            content: user
        }
        ], 900);

        let text = data.choices?.[0]?.message?.content ?? '';

        text = text
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const m = text.match(/\\{[\\s\\S]*\\}/);
            if (m) parsed = JSON.parse(m[0]);
        }

        if (!parsed || !parsed.ideas) {
            return res.status(500).json({
                error: 'OpenAI returned unexpected format',
                raw: text
            });
        }
        res.json(parsed);
    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: 'AI error',
            detail: err?.response?.data ?? err.message
        });
    }
});

/*
POST /api/ai/listing
Body: { titleHint: "", features: "e.g. png, svg", keywords: ["a","b"] }
Response: { title: "", description: "", tags: [] }
*/
app.post('/api/ai/listing', async (req, res) => {
    try {
        const {
            phrase = '', titleHint = '', features = '', keywords = []
        } = req.body;
        const system = `You are an expert Etsy seller and SEO copywriter.`;
        const user = `
       You are an expert Etsy SEO copywriter and top-performing digital product seller.

Your job: Create a HIGH-CONVERTING Etsy listing for a DIGITAL DOWNLOAD.

PRIMARY PHRASE:
"${phrase}"

PRODUCT FEATURES:
${features}

SEO KEYWORDS (use only for inspiration — NEVER keyword-stuff):
${JSON.stringify(keywords)}

----------------------------------
WRITING STYLE RULES
----------------------------------
Write like a real Etsy seller:
- Friendly, reassuring, professional
- Human, natural sentence flow
- Show benefits, not just features
- Avoid repetition
- Avoid robotic patterns
- Avoid generic filler phrases

Speak directly to the buyer:
- why this design is useful
- who it’s perfect for
- when they might use or gift it

----------------------------------
TITLE RULES
----------------------------------
- Max 140 characters
- Start with the PRIMARY PHRASE
- Include real buyer search terms (Cricut, SVG, shirt design, etc. when appropriate)
- Add emotional or practical value
- No keyword stuffing
- No awkward grammar

----------------------------------
DESCRIPTION STRUCTURE (IN THIS ORDER)
----------------------------------

1️⃣ INTRO (2–3 short lines)
Explain:
- what the product is
- who it’s for
- why it’s helpful or special

2️⃣ WHAT’S INCLUDED
Be specific. Include:
- file formats (PNG, SVG, PDF, etc.)
- resolution
- DPI
- transparent background if true
- whether SVG scales cleanly
- compatible tools (Cricut, Silhouette, etc.)

3️⃣ USAGE IDEAS
Give examples:
- shirts, mugs, cards, gifts, decor, etc.
- occasions (birthday, Valentine’s Day, anniversary, holidays, etc.)

4️⃣ DIGITAL PRODUCT NOTICE (rewrite naturally)
Clearly say:
This is a DIGITAL DOWNLOAD and nothing is shipped physically.

5️⃣ DOWNLOAD & UNZIP INSTRUCTIONS (rewrite naturally)
Explain:
- where downloads appear in Etsy
- how to unzip files
- note that large packs may include a PDF link file

6️⃣ REFUNDS / HELP (rewrite naturally)
Explain:
- digital items are non-refundable
- support is always provided if something goes wrong

7️⃣ CONTACT / SUPPORT
Encourage messaging in a warm, friendly way.

----------------------------------
TAG RULES
----------------------------------
Generate EXACTLY 13 tags.

Each tag must:
- be 2–4 words
- under 20 characters
- contain no punctuation
- contain no duplicates
- be meaningful search terms
- start with SPECIFIC buyer-intent phrases first
  then broader niche phrases last

Examples of good tags:
love quote png
valentine shirt png
romantic png file

----------------------------------
OUTPUT FORMAT (JSON ONLY)
----------------------------------

{
  "title": "",
  "description": "",
  "tags": ["", "", "", "", "", "", "", "", "", "", "", "", ""]
}

Do not explain.
Do not add extra text.
Return JSON ONLY.


        `;


        const data = await callOpenAI([{
            role: 'system',
            content: system
        },
        {
            role: 'user',
            content: user
        }
        ], 1000);

        const text = data.choices?.[0]?.message?.content ?? '';
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const m = text.match(/\\{[\\s\\S]*\\}/);
            if (m) parsed = JSON.parse(m[0]);
        }

        if (!parsed || !parsed.title) {
            return res.status(500).json({
                error: 'OpenAI returned unexpected format',
                raw: text
            });
        }
        res.json(parsed);
    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: 'AI error',
            detail: err?.response?.data ?? err.message
        });
    }
});

/*
POST /api/ai/mockup-prompt
Body: { productType: "t-shirt", styleHint: "vintage", colorsToUse: "cream", keyword: "dog mom" }
Response: { prompt: "..." }
*/
app.post('/api/ai/mockup-prompt', async (req, res) => {
    console.log("cha vo day");
    try {
        const {
            productType = 't-shirt', styleHint = '', colorsToUse = '', keyword = ''
        } = req.body;
        const system = `You are a creative art director who writes short, clear prompts for text-to-image models to create product mockups.`;
        const user = `
You are generating cinematic lifestyle mockup prompts for a Print-on-Demand Etsy product.

PRODUCT:
Product: ${productType}
Keyword: "${keyword}"
Style: ${styleHint}
Color tone: ${colorsToUse}
Season (optional): ${styleHint} (none, Valentine, Christmas, Fall, Spring, Summer, Winter)

GOAL:
Real, cinematic, trustworthy mockups that look like professional Etsy photos.
Create EXACTLY 3 prompts. Each one must feel different.

RULES FOR VARIATION (VERY IMPORTANT):
Across the 3 images, ALL of these must change:
• different background
• different camera distance/framing
• different pose or interaction
• different angle or perspective
• slightly different lighting mood (but still realistic)

No two images are allowed to look similar.

Choose ONE cinematic mood for the whole set:
soft lifestyle film, warm natural daylight, cozy editorial, subtle vintage tone, premium DSLR.

SEASON MODE (if ${styleHint} is used):
Valentine: warm soft romance, gentle decor only.
Christmas: soft golden lights, cozy home, subtle pine details.
Fall: earthy tones, warm textures, leaves used subtly.
Spring: fresh daylight, florals, airy tone.
Summer: relaxed bright daylight, outdoors optional.
Winter: cool soft tones, blankets, gentle comfort.
Never add clip-art, stickers, fake decorations, or holiday text on the product.

────────────────────────
1️⃣ HERO IMAGE — MAIN THUMBNAIL
────────────────────────
A scroll-stopping waist-up close-up, focused clearly on the design.

• Clean studio-style people is using the product shot • Front-facing ${productType}, perfectly flat or lightly shaped 
• Neutral background: soft white, light beige, light gray, or soft fabric backdrop 
• The design must be centered, large, and readable even at thumbnail size 
• People is wearing the product (no floating product shots) 
• Soft, natural shadows (avoid harsh contrast) 
• Print should look realistically applied to fabric (not floating, not glowing, no fake shine) 
• Background should have decoration or props arround it that give context to the product use and should apply the season if any Mood options (choose one naturally):${styleHint}
• Professional ecommerce lighting and composition 
• Realistic lighting, no dramatic shadows Goal: Make the design instantly clear at small size and look like a trustworthy, professional brand.

──────────────────────── 
2️⃣ LISTING IMAGE #2 — LIFESTYLE (REAL HUMAN CONTEXT) 
────────────────────────
 Create a realistic lifestyle moment. 
 • A real person casually wearing or using the ${productType} 
 • Natural daylight (window light, outdoor shade, soft room lighting) 
 • Relaxed expression, natural posture • Environment should feel authentic: home, street, café, park, studio 
 • Avoid stock-photo vibes • The design must still be visible and readable 
 • No distracting filters, overlays, or backgrounds 
 • background should be lifestyle, not plain studio Mood options (choose one naturally): 
 • cozy and friendly 
 • joyful everyday life 
 • relaxed minimalist aesthetic • soft editorial lifestyle Goal: Build trust. Make the buyer imagine themselves owning it. 

 ──────────────────────── 
 3️⃣ LISTING IMAGE #3 — DETAIL CLOSE-UP (QUALITY PROOF)
 ──────────────────────── 
 Zoom into the print to show quality. 
 • Close-up of the print area 
 • Fabric texture visible (cotton fibers, stitching) 
 • Print edges sharp and realistic 
 • No pixelation, no glow, no blur 
 • Show slight wrinkles and fabric movement 
 • Subtle natural lighting, light shadow depth 
 • Background should have some context (fabric, table, person’s body) Goal: Prove print quality, reduce buyer hesitation.

Do not blur the design away. No fake shine. No repeated backgrounds.

──────────────────────── 
CAMERA RULESET (Etsy Bestseller Style)
──────────────────────── 

This photo uses a “Lifestyle Product Focus” camera system.
Follow these rules:
1. Camera Angle
• Slightly above chest level
• Facing straight toward the model
• Not tilted
• Not dramatic
• Feels like a mirror selfie
• This makes the shirt feel real and wearable.

2. Crop Rule (critical)
• The image is cropped:
• From mid-thigh
• To just above the hat
• Face is hidden or partially hidden.
The shirt is the hero.

Never show:
❌ full face
❌ feet
❌ head to toe
This removes identity and focuses attention on the product.

3. Focal Length Look
Simulates:
• 50–70mm lens
This:
• Avoids distortion
• Makes the body natural
• Keeps the shirt flat and readable
4. Framing
• Subject centered
• Shirt graphic sits in the center third
• Plenty of empty space around the design
This ensures:
Design stays readable even in small Etsy thumbnails.


────────────────────────
GENERAL RULES
────────────────────────
Product always remains the star.
No floating objects, warped bodies, extra fingers, or surreal AI looks.
No stickers, logos, overlays, or watermarks.
No harsh dramatic lighting or heavy filters.
Match style hint: ${styleHint}. Keep cinematic but commercially real.


OUTPUT (JSON ONLY):

{
"prompts": [
"Listing Image #1: ...",
"Listing Image #2: ...",
"Listing Image #3: ..."
]
}

No explanations.
No more than 3 prompts.
No markdown.
`;


        const data = await callOpenAI([{
            role: 'system',
            content: system
        },
        {
            role: 'user',
            content: user
        }
        ], 400);

        const text = data.choices?.[0]?.message?.content ?? '';
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const m = text.match(/\\{[\\s\\S]*\\}/);
            if (m) parsed = JSON.parse(m[0]);
        }

        if (!parsed || !parsed.prompts) {
            return res.status(500).json({
                error: 'OpenAI returned unexpected format',
                raw: text
            });
        }
        res.json(parsed);
    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: 'AI error',
            detail: err?.response?.data ?? err.message
        });
    }
});



app.post('/api/ai/clone-mockup-prompt', async (req, res) => {
    console.log("co vo day không");

    try {
        const {
            productType = 't-shirt', styleHint = '', colorsToUse = '', keyword = '', cloneSource = ''
        } = req.body;
        const system = `
You are a creative art director who writes short, clear prompts for text-to-image models to create realistic, cinematic Etsy mockups. 
Keep the structure clean, avoid unnecessary repetition, and always respect the user content.
        `.trim();

        // 👇 NEW: we use ONLY the clone text as the user source
        const user = `
You will rewrite and refine this mockup prompt so it becomes cleaner, cinematic, and usable for Etsy product mockups.

Keep meaning, improve clarity, do NOT invent new concepts that are not there, and do not remove important details.

Product type: ${productType}, change to ${productType} color to ${colorsToUse} in the prompt.

If it have full body people in the original prompt, keep people in the new prompt and make keep rules:
- Keep all concepts and action of the body from the original prompt.
- People should Create a style like a professional model photograph for Etsy product listing. Avoid regular standing, it should stand in model style
- People be wearing if ${productType} is t-shirt or using the ${productType}.
- Ìf ${cloneSource} have the sitting, use sitting leg crossed over people's left on the stair/floor/chair/sofa/table/bancony randomly. Otherwise we still keep standing.
- Add this text to prompt "The camera is cropped to crop to show only the  ${productType} area, no full face visible to her thighs.".

If it don't have people or have a partial body in the original prompt, make sure:
- Do not add people in the new prompt.
- Keep all concepts from the original prompt.
- The design must be centered, large, and readable even at thumbnail size on the ${productType}.
- Keep all decoration or props around it that give context to the ${productType} use from the original prompt.
- The camera is cropped to show the design on the product.
- Replace all shoe/pants/ and all ecoration items with the new stuff to follow the ${styleHint}.

Background should follow and replace with ${styleHint}.and it should only 10% to 15% on the image, strongly focus on the design.
Decoration should follow and replace with ${styleHint}. Avoid use the plain background with no decoration.

Remove all elements(graphic and text) on the ${productType} from original prompt with and add the new design on the ${productType}.

Add this text to prompt "Ensuring focus remains on the product, the new design must be centered, super large, and readable even at thumbnail size on the ${productType}".

Original prompt from user (do not ignore, refine it):

${cloneSource}


If ${cloneSource} have people we 
Make sure add this prompt rule block:
"Lifestyle Etsy mockup, soft natural window light from the left, ${styleHint} tone, mirror selfie feel, model cropped from mid-thigh to mount/neck/hat, face partially hidden, shirt centered and flat, no harsh shadows, no studio lighting, cozy home interior blurred, 50mm lens look, product-focused framing"

If ${cloneSource} don't have people we 
Make sure add this prompt rule block:
"Lifestyle Etsy mockup, soft natural window light from the left, ${styleHint} tone, shirt centered and flat, no harsh shadows, no studio lighting, cozy home interior blurred, 50mm lens look, product-focused framing"
// warm neutral
---------------------------------
You MUST return JSON ONLY in the following format:

FOR EACH COLOR
  → send one request
  → get one prompt
  → display one block

{
  "prompts": [
    "Listing Image: ...",
  ]
}

Do NOT include explanations.
Do NOT include extra fields.
Do NOT add markdown.
        `

        const data = await callOpenAI([{
            role: 'system',
            content: system
        },
        {
            role: 'user',
            content: user
        }
        ], 400);

        const text = data.choices?.[0]?.message?.content ?? '';
        let parsed = null;

        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
        }

        if (!parsed || !parsed.prompts) {
            return res.status(500).json({
                error: 'OpenAI returned unexpected format',
                raw: text
            });
        }

        res.json(parsed);

    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: 'AI error',
            detail: err?.response?.data ?? err.message
        });
    }
});



/*
POST /api/ai/filename
Body: { filename: "cat lover design.png", keywords: ["cat","vintage"] }
Response: { filename: "..." }
*/
app.post('/api/ai/filename', async (req, res) => {
    try {
        const {
            filename = '', keywords = []
        } = req.body;
        const system = `You are a helpful assistant that turns filenames into SEO-friendly filenames for Etsy digital products.`;
        const user = `Input filename: "${filename}". keywords: ${JSON.stringify(keywords)}.
Return a single-line JSON: {"filename":"<seo-friendly-filename-with-hyphens-and-keywords>.png"}. Keep extension same as input.`;

        const data = await callOpenAI([{
            role: 'system',
            content: system
        },
        {
            role: 'user',
            content: user
        }
        ], 200);

        const text = data.choices?.[0]?.message?.content ?? '';
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const m = text.match(/\\{[\\s\\S]*\\}/);
            if (m) parsed = JSON.parse(m[0]);
        }

        if (!parsed || !parsed.filename) {
            return res.status(500).json({
                error: 'OpenAI returned unexpected format',
                raw: text
            });
        }
        res.json(parsed);
    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: 'AI error',
            detail: err?.response?.data ?? err.message
        });
    }
});


/* health */


/*
POST /api/ai/trends
Body:  {}
Response: { trends: [ ... ] }
*/
app.post('/api/ai/trends', async (req, res) => {
    try {

        const trendSchema = {
            name: "TrendList",
            schema: {
                type: "object",
                properties: {
                    trends: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                event: {
                                    type: "string"
                                },
                                date: {
                                    type: "string"
                                },
                                region_or_scope: {
                                    type: "string"
                                },
                                why: {
                                    type: "string"
                                },
                                styles: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    }
                                },
                                ideas: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    }
                                }
                            },
                            required: ["event", "date", "region_or_scope", "why", "styles", "ideas"]
                        }
                    }
                },
                required: ["trends"]
            }
        };

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: {
                type: "json_schema",
                json_schema: trendSchema
            },
            messages: [{
                role: "system",
                content: "You generate perfect JSON for POD trend analysis."
            },
            {
                role: "user",
                content: `
                  Today's date: ${new Date().toISOString().split("T")[0]}

Generate EXACTLY 10 upcoming dates for Print-on-Demand (POD) creators.

🚨 ABSOLUTE TIME CONSTRAINT (DO NOT VIOLATE):
- ONLY include events occurring from TODAY up to 60 days from TODAY.
- DO NOT include events beyond this 60-day window under any circumstance.
- DO NOT include events in later months even if they are important.
- DO NOT include events in later years.
- If fewer than 10 globally significant events exist in this window, return fewer than 10.

EVENT SELECTION PRIORITY (ONLY WITHIN THIS WINDOW):
1️⃣ UN / UNESCO / globally recognized international days  
   (e.g. International Women’s Day, World Environment Day, LGBTQ+ Pride days)
2️⃣ Major public holidays (USA, EU, UK, CA, AU)
3️⃣ Widely observed cultural or religious events
4️⃣ Awareness & advocacy days with strong POD relevance
5️⃣ Commercial POD opportunities

STRICT RULES:
- NO events beyond 60 days from TODAY.
- NO year jumps.
- NO placeholder or filler events.
- ALL dates must be real and verifiable.
- Sort events strictly by date ascending.
- If an event already passed this year, DO NOT include it.

FOR EACH EVENT INCLUDE:
- event
- date (YYYY-MM-DD)
- region_or_scope
- why
- styles (array)
- ideas (array)

OUTPUT:
Return JSON ONLY.
No explanations.
No markdown.

{
  "trends": [
    {
      "event": "",
      "date": "",
      "region_or_scope": "",
      "why": "",
      "styles": [],
      "ideas": []
    }
  ]
}

                    `
            }

            ],
            max_tokens: 2000,
            temperature: 0.3
        });

        const json = response.choices[0].message.content;
        res.json(JSON.parse(json));

    } catch (err) {
        console.error("Trend Error:", err);
        res.status(500).json({
            error: "AI error",
            detail: err?.response?.data ?? err.message
        });
    }
});


/*
POST /api/ai/predict-trends
Body:
{
    "niches": ["dog mom", "teacher", "anime"]
}
Response:
{
  "predictions": [...]
}
*/
app.post('/api/ai/predict-trends', async (req, res) => {
    try {
        const niches = req.body.niches || [];

        const system = `
You are an expert in POD (Print On Demand), e-commerce seasonal trends, Etsy SEO, holiday cycles, 
consumer psychology, and trend forecasting.`;

        const user = `
Predict upcoming POD trends using a HYBRID model:
1. Global trend predictions  
2. Holiday season predictions  
3. Predictions based on these user niches: ${JSON.stringify(niches)}

IMPORTANT RULES:
- Return ONLY valid JSON.
- Arrays must contain ONLY strings.
- No trailing commas.
- No markdown.
- No commentary.
- No bullet points like "-" or "*".
- No line breaks inside array values.
- Your entire output MUST match this schema EXACTLY:

{
  "predictions": [
    {
      "trend": "string",
      "category": "global | holiday | user",
      "score": 0,
      "why": "string",
      "deadline": "string",
      "designStyles": ["string"],
      "productIdeas": ["string"],
      "actionPlan": "string"
    }
  ]
}

Do not include any text before or after this JSON object.
`;


        const data = await callOpenAI([{
            role: "system",
            content: system
        },
        {
            role: "user",
            content: user
        }
        ], 1200);

        let text = data.choices?.[0]?.message?.content ?? "";

        // clean accidental formatting
        // Fix common AI JSON issues
        text = text
            .replace(/,\s*]/g, "]") // remove trailing commas
            .replace(/,\s*}/g, "}") // remove trailing object commas
            .replace(/“/g, '"') // replace fancy quotes
            .replace(/”/g, '"')
            .replace(/‘/g, "'")
            .replace(/’/g, "'")
            .replace(/[\r\n]+/g, " "); // flatten accidental line breaks inside strings


        let json = null;

        try {
            json = JSON.parse(text);
        } catch (e) {
            // Try extracting the JSON object only
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    json = JSON.parse(match[0]);
                } catch (e2) {
                    console.error("Double parse error", e2, "RAW:", text);
                }
            }
        }

        if (!json || !json.predictions) {
            return res.status(500).json({
                error: "Unexpected AI JSON format",
                raw: text
            });
        }


        res.json(json);

    } catch (err) {
        console.error(err?.response?.data ?? err.message);
        res.status(500).json({
            error: "AI error",
            detail: err?.response?.data ?? err.message
        });
    }
});




/*
POST /api/ai/design-style
Body: { phrase, niche }
Response:
{
  "style": {
    "typography": [],
    "fonts": [],
    "colors": [],
    "layout": "",
    "illustration": "",
    "texture": "",
    "products": []
  }
}
*/
app.post("/api/ai/design-style", async (req, res) => {
    try {
        const {
            phrase = "", niche = ""
        } = req.body;

        const system = `
You are an expert POD designer specializing in Kittl, Etsy bestsellers, 3D puff, vintage, kawaii, retro, and modern T-shirt layouts.
Always output JSON only.
`;

        const user = `
Generate a complete POD-ready design style for the following:
Phrase: "${phrase}"
Niche: "${niche}"

Return JSON exactly like this:
{
  "style": {
    "typography": ["retro bold", "script accent"],
    "fonts": ["Kittl Antique", "Sunday Retro", "Bebas Neue"],
    "colors": ["#FDC57B","#FF725E","#2B2D42"],
    "layout": "arched badge with center icon",
    "illustration": "retro sunset with horizontal stripes",
    "texture": "distressed vintage grain",
    "products": ["t-shirt","hoodie","sticker","tote bag"]
  }
}
`;

        const data = await callOpenAI([{
            role: "system",
            content: system
        },
        {
            role: "user",
            content: user
        }
        ], 1000);

        let text = data.choices?.[0]?.message?.content ?? "";
        text = text.replace(/```json|```/g, "").trim();

        res.send(JSON.parse(text));

    } catch (err) {
        console.error("AI Design Style Error:", err);
        res.status(500).json({
            error: "AI error",
            detail: err?.response?.data ?? err.message
        });
    }
});

/*
POST /api/ai/design-brief
Body: { phrase, niche }
Response:
{
  "brief": {
    "phrase": "",
    "style_direction": "",
    "font_pairing": [],
    "color_palette": [],
    "layout": "",
    "illustration": [],
    "texture": "",
    "products": [],
    "mockup_prompt": "",
    "seo_title": "",
    "tags": []
  }
}
*/
app.post("/api/ai/design-brief", async (req, res) => {
    try {
        const {
            idea = "", phrase = "", niche = ""
        } = req.body;

        const briefSchema = {
            name: "DesignBrief",
            schema: {
                type: "object",
                properties: {
                    brief: {
                        type: "object",
                        properties: {
                            idea: {
                                type: "string"
                            },
                            phrase: {
                                type: "string"
                            },
                            style_direction: {
                                type: "string"
                            },
                            font_pairing: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            color_palette: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            layout: {
                                type: "string"
                            },
                            illustration: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            texture: {
                                type: "string"
                            },
                            products: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            mockup_prompt: {
                                type: "string"
                            },
                            seo_title: {
                                type: "string"
                            },
                            tags: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },

                            example_designs: {
                                type: "array",
                                items: {
                                    type: "string"
                                },
                                minItems: 6,
                                maxItems: 6
                            }
                        },
                        required: [
                            "phrase", "style_direction", "font_pairing", "color_palette",
                            "layout", "illustration", "texture", "products",
                            "mockup_prompt", "seo_title", "tags", "example_designs"
                        ]
                    }
                },
                required: ["brief"]
            }
        };


        // --------------------------
        // UPDATED STRONGER PROMPT
        // --------------------------

        const userPrompt = `
Create a COMPLETE print-on-demand design brief for the phrase:

Idea: ${idea}
Phrase: "${phrase}"

The final brief must ALWAYS stay consistent with BOTH the idea AND the phrase.
Do not change meaning. Do not improvise new concepts.

────────────────────────────────
🧠 STYLE AUTO-SELECTION (MANDATORY)
────────────────────────────────

First, analyze the phrase and idea to determine its ONE dominant buyer sentiment and intent.

Classify the phrase into ONE of the following sentiment categories (internal reasoning only):
- Cute / Affectionate
- Humorous / Sarcastic
- Nostalgic
- Bold / Assertive
- Calm / Comforting
- Edgy / Rebellious
- Seasonal / Festive

Then, based on that sentiment AND typical POD buyer behavior on Etsy and Redbubble,
select EXACTLY ONE style_direction using this mapping:

Cute / Affectionate → kawaii OR cute illustration  
Humorous / Sarcastic → playful typography OR bold typography  
Nostalgic → vintage retro OR retro typography  
Bold / Assertive → bold minimal OR streetwear  
Calm / Comforting → cozy illustration OR organic minimal  
Edgy / Rebellious → grunge streetwear OR urban graphic  
Seasonal / Festive → holiday festive OR a specific holiday style  

Selection rules:
- Choose EXACTLY ONE style_direction
- Prefer the style that has higher POD gift appeal and visual clarity
- Prefer simpler, proven styles over experimental ones
- DO NOT combine styles
- DO NOT invent new styles
- DO NOT use commas

────────────────────────────────
🎨 STYLE CONSISTENCY RULE (CRITICAL)
────────────────────────────────

The chosen style_direction MUST be used consistently across:
- illustration
- typography
- color palette
- layout
- example URLs

All elements must visually belong to the SAME aesthetic.
Do NOT mix aesthetics.
Do NOT introduce secondary styles.

────────────────────────────────
🎨 ALLOWED style_direction VALUES
────────────────────────────────

You MUST choose ONE value from this list ONLY:

kawaii  
cute illustration  
playful typography  
bold typography  
vintage retro  
retro typography  
bold minimal  
streetwear  
cozy illustration  
organic minimal  
grunge streetwear  
urban graphic  
holiday festive  
christmas vintage  
halloween spooky  
valentine cute  

INVALID examples (DO NOT DO THIS):
"kawaii, playful, cheerful"  
"retro + modern"  
"cute and funny"  

────────────────────────────────
🔗 EXAMPLE DESIGN URL REQUIREMENTS
────────────────────────────────

You MUST generate EXACTLY **6 highly relevant example design URLs**, one from EACH source:

1. Pinterest  
2. Kittl  
3. Google Images  
4. Dribbble  
5. Etzy
6. Behance  
7. Redbubble  

Each URL MUST be a REAL, WORKING search URL that reflects ACTUAL POD inspiration patterns.

Each URL query MUST include:
- the idea
- the phrase
- the chosen style_direction
- ONE POD product best suited for that style
- ONE or TWO HEX colors from the palette

Product selection rules:
- kawaii / cute → prioritize t-shirt, sticker, mug
- typography → t-shirt, hoodie, poster
- streetwear / grunge → hoodie or oversized tee
- holiday → t-shirt or giftable product

DO NOT invent random keywords.
DO NOT generalize.
DO NOT output generic searches.

────────────────────────────────
🔗 REQUIRED URL FORMATS
────────────────────────────────

Pinterest:
https://www.pinterest.com/search/pins/?q=<idea> <phrase> <style_direction> <product> <hex_color>

Kittl:
https://www.kittl.com/templates/search?query=<idea> <style_direction>

Google Images:
https://www.google.com/search?tbm=isch&q=<idea> <phrase> <style_direction> <product> <hex_color>

Dribbble:
https://dribbble.com/search/<idea> <style_direction>

Etsy:
https://www.etsy.com/search?q=<idea> <phrase> <product> <style>

Behance:
https://www.behance.net/search?search=<idea> <style_direction> <hex_color>

Redbubble:
https://www.redbubble.com/shop/?query=<idea> <phrase> <style_direction> <product> <hex_color>

────────────────────────────────
🚫 STRICT RULES (DO NOT BREAK)
────────────────────────────────

- Output ONLY valid JSON following the schema EXACTLY
- example_designs MUST contain EXACTLY 6 URLs
- URLs must be realistic, relevant, and stylistically aligned
- No placeholder text
- No explanations
- No markdown
- No extra commentary
- All HEX colors must be valid (#RRGGBB)
        `;



        // --------------------------
        // OPENAI CALL
        // --------------------------

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: {
                type: "json_schema",
                json_schema: briefSchema
            },
            messages: [{
                role: "system",
                content: "You produce ultra-precise POD design briefs with highly relevant inspiration URLs."
            },
            {
                role: "user",
                content: userPrompt
            }
            ],
            temperature: 0.35,
            max_tokens: 2000
        });

        const json = response.choices[0].message.content;
        res.json(JSON.parse(json));

    } catch (err) {
        console.error("Design Brief Error:", err);
        res.status(500).json({
            error: "AI error",
            detail: err?.response?.data ?? err.message
        });
    }
});




import fs from "fs";

app.post("/save-brief", (req, res) => {
    const {
        filename,
        content
    } = req.body;

    const folder = path.join(process.cwd(), "briefing");
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);

    const filepath = path.join(folder, filename);
    fs.writeFileSync(filepath, JSON.stringify(content, null, 2));

    res.json({
        saved: true,
        path: filepath
    });
});


app.post("/api/ai/trend-pack", async (req, res) => {
    try {
        const {
            trend = ""
        } = req.body;
        const today = new Date().toISOString().split("T")[0];

        const packSchema = {
            name: "DesignPackPerPhrase",
            schema: {
                type: "object",
                properties: {
                    pack: {
                        type: "object",
                        properties: {
                            trend: {
                                type: "string"
                            },

                            // top-level example url buckets
                            example_urls: {
                                type: "object",
                                properties: {
                                    pinterest: {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    kittl: {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    freepik: {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    etsy: {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    }
                                },
                                required: ["pinterest", "kittl", "freepik", "etsy"]
                            },

                            // designs array (5 per pack)
                            designs: {
                                type: "array",
                                minItems: 5,
                                maxItems: 5,
                                items: {
                                    type: "object",
                                    properties: {
                                        phrase: {
                                            type: "string"
                                        },

                                        brand_style: {
                                            type: "object",
                                            properties: {
                                                keywords: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                mood: {
                                                    type: "string"
                                                },
                                                visual_identity: {
                                                    type: "string"
                                                },
                                                lighting: {
                                                    type: "string"
                                                },
                                                restrictions: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                }
                                            },
                                            required: ["keywords", "mood", "visual_identity"]
                                        },

                                        typography_system: {
                                            type: "object",
                                            properties: {
                                                primary: {
                                                    type: "string"
                                                },
                                                secondary: {
                                                    type: "string"
                                                },
                                                display: {
                                                    type: "string"
                                                },
                                                rules: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                }
                                            },
                                            required: ["primary", "secondary"]
                                        },

                                        color_system: {
                                            type: "object",
                                            properties: {
                                                primary: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                secondary: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                accent: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                avoid: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                }
                                            },
                                            required: ["primary", "secondary"]
                                        },

                                        illustration_system: {
                                            type: "object",
                                            properties: {
                                                style: {
                                                    type: "string"
                                                },
                                                stroke_weight: {
                                                    type: "string"
                                                },
                                                shading: {
                                                    type: "string"
                                                },
                                                allowed_elements: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                forbidden_elements: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                }
                                            },
                                            required: ["style", "allowed_elements"]
                                        },

                                        layout_system: {
                                            type: "object",
                                            properties: {
                                                patterns: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                spacing_rules: {
                                                    type: "string"
                                                },
                                                hierarchy: {
                                                    type: "string"
                                                },
                                                safe_area: {
                                                    type: "string"
                                                },
                                                grid: {
                                                    type: "string"
                                                }
                                            },
                                            required: ["patterns"]
                                        },

                                        texture_system: {
                                            type: "object",
                                            properties: {
                                                allowed: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                forbidden: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                effect_level: {
                                                    type: "string"
                                                }
                                            }
                                        },

                                        mockup_system: {
                                            type: "object",
                                            properties: {
                                                camera: {
                                                    type: "string"
                                                },
                                                lighting: {
                                                    type: "string"
                                                },
                                                background: {
                                                    type: "string"
                                                },
                                                prompts: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                }
                                            },
                                            required: ["prompts"]
                                        },

                                        product_guidelines: {
                                            type: "object",
                                            properties: {
                                                tshirt: {
                                                    type: "string"
                                                },
                                                hoodie: {
                                                    type: "string"
                                                },
                                                sticker: {
                                                    type: "string"
                                                },
                                                mug: {
                                                    type: "string"
                                                },
                                                poster: {
                                                    type: "string"
                                                },
                                                tote: {
                                                    type: "string"
                                                }
                                            },
                                            required: ["tshirt"]
                                        },

                                        seo: {
                                            type: "object",
                                            properties: {
                                                title: {
                                                    type: "string"
                                                },
                                                tags: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                short_description: {
                                                    type: "string"
                                                },
                                                long_description: {
                                                    type: "string"
                                                }
                                            },
                                            required: ["title", "tags"]
                                        },

                                        example_urls: {
                                            type: "object",
                                            properties: {
                                                pinterest: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                kittl: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                freepik: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                },
                                                etsy: {
                                                    type: "array",
                                                    items: {
                                                        type: "string"
                                                    }
                                                }
                                            },
                                            required: ["pinterest", "kittl", "freepik", "etsy"]
                                        }
                                    },
                                    required: [
                                        "phrase",
                                        "brand_style",
                                        "typography_system",
                                        "color_system",
                                        "illustration_system",
                                        "layout_system",
                                        "mockup_system",
                                        "product_guidelines",
                                        "seo",
                                        "example_urls"
                                    ]
                                }
                            }
                        },
                        required: ["trend", "example_urls", "designs"]
                    }
                },
                required: ["pack"]
            }
        };

        const userPrompt = `
 Today's date: ${today}

Create a complete design pack for the trend: "${trend}".

Produce exactly 5 distinct design systems, each based on a unique phrase.  
All output must strictly follow the JSON schema.  
No extra fields. No missing fields. No commentary.

-----------------------------
URL GENERATION REQUIREMENTS
-----------------------------

For both:
• pack.example_urls  
AND  
• each design.example_urls  

You must generate fully formed, real search URLs.

Every URL must include:
- the phrase
- a design style (retro, kawaii, minimal, vintage, grunge, bold, etc.)
- a POD product keyword (“tshirt”, “hoodie”, “mug”, “sticker”, “poster”)
- one or two HEX color codes from the design palette

All URLs must be valid, query-based links.  
Do NOT produce placeholders or empty arrays.

Use these URL formats:

Pinterest:
https://www.pinterest.com/search/pins/?q=<phrase> <style> <product> <color>

Kittl:
https://www.kittl.com/search?q=<phrase> <style>

Google Images:
https://www.google.com/search?tbm=isch&q=<phrase> <style> <product> <color>

Freepik:
https://www.freepik.com/search?query=<phrase> <style>

Etsy:
https://www.etsy.com/search?q=<phrase> <product> <style>

Redbubble:
https://www.redbubble.com/shop/?query=<phrase> <product> <style> <color>

Rules:
- Never include angle brackets (< >) in the final output.
- Replace <phrase>, <style>, <product>, <color> with real values.
- All colors must be valid #RRGGBB hex codes.

-----------------------------
DESIGN SYSTEM FIELDS REQUIRED
-----------------------------

Each design must include:

brand_style:
- keywords
- mood
- visual_identity
- lighting
- restrictions

typography_system:
- primary
- secondary
- display
- rules

color_system:
- primary (4–6 hex)
- secondary (2–4 hex)
- accent
- avoid

illustration_system:
- style
- stroke_weight
- shading
- allowed_elements
- forbidden_elements

layout_system:
- patterns
- spacing_rules
- hierarchy
- safe_area
- grid

texture_system:
- allowed
- forbidden
- effect_level

mockup_system:
- camera: Describe the cinematic lens, angle and depth (e.g., “35mm lens, shallow DOF, warm commercial perspective”)
- lighting: Rich atmospheric lighting appropriate to the scene (golden hour glow, soft studio diffusion, neon rim light, natural window light)
- background: Immersive, visually expressive setting that enhances the product (rooftop at sunset, minimal studio, lively street backdrop)
- prompts (exactly 3):
    • Prompt 1 MUST be a lifestyle mockup featuring a real human wearing or using the POD product (e.g., wearing the t-shirt, holding the mug, carrying the tote bag).  
      Include cinematic emotion, pose, vibe, and environment.
    • Prompt 2 MUST be a clean commercial studio mockup highlighting product details (fabric texture, print clarity, shape).
    • Prompt 3 MUST be a creative or aesthetic scene (flat lay, stylized product-only setup, color-themed environment, or dramatic lighting composition).


product_guidelines:
- tshirt
- hoodie
- sticker
- mug
- poster
- tote

seo:
- title
- tags (7–13)
- short_description
- long_description

example_urls:
- pinterest (3)
- kittl (2)
- freepik (2)
- etsy (2)
- redbubble (2)
- google (2)

-----------------------------
STRICT JSON OUTPUT RULES
-----------------------------

- Output only JSON following the schema.
- Escape all special characters properly.
- No trailing commas.
- No comments.
- No line breaks that break JSON.
- No unescaped quotes.
- Do not wrap output in backticks.

Return ONLY:
{
  "pack": { ... }
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: {
                type: "json_schema",
                json_schema: packSchema
            },
            messages: [{
                role: "system",
                content: "You are an expert POD design director. Produce strict JSON that matches the schema exactly. No commentary."
            },
            {
                role: "user",
                content: userPrompt
            }
            ],
            temperature: 0.35,
            max_tokens: 4000
        });

        const jsonText = response.choices?.[0]?.message?.content;
        const parsed = JSON.parse(jsonText);
        return res.json(parsed);
    } catch (err) {
        console.error("Trend Pack Error:", err);
        res.status(500).json({
            error: "AI error",
            detail: err?.response?.data ?? err?.message ?? String(err)
        });
    }
});


app.post("/api/ai/evaluate-ideas", async (req, res) => {
    try {
        const {
            ideas = [], niche = ""
        } = req.body;

        if (!Array.isArray(ideas) || ideas.length === 0) {
            return res.status(400).json({
                error: "No ideas provided."
            });
        }

        const evalSchema = {
            name: "IdeaEvaluationChunk",
            schema: {
                type: "object",
                properties: {
                    results: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                text: {
                                    type: "string"
                                },
                                score: {
                                    type: "number"
                                },
                                label: {
                                    type: "string",
                                    enum: ["RECOMMENDED", "RISKY", "OUTDATED"]
                                },
                                signals: {
                                    type: "array",
                                    items: {
                                        type: "string",
                                        enum: [
                                            "high buyer intent",
                                            "low buyer intent",
                                            "oversaturated niche",
                                            "seasonal demand",
                                            "evergreen demand",
                                            "trademark risk",
                                            "strong gift appeal",
                                            "weak emotional appeal",
                                            "emerging trend",
                                            "declining trend"
                                        ]
                                    },
                                    minItems: 1,
                                    maxItems: 3
                                }
                            },
                            required: ["text", "score", "label", "signals"]
                        }
                    }
                },
                required: ["results"]
            }
        };

        // 🔹 Chunk helper
        const chunk = (arr, size) =>
            Array.from({
                length: Math.ceil(arr.length / size)
            }, (_, i) =>
                arr.slice(i * size, i * size + size)
            );

        const chunks = chunk(ideas, 6); // 👈 SAFE SIZE
        let finalResults = [];

        for (const group of chunks) {
            const prompt = `
                You are a Print-on-Demand market evaluator.
                
                Evaluate EACH phrase for the niche "${niche}".
                
                PHRASES:
                ${group.map((x, i) => `${i + 1}. ${x}`).join("\n")}
                
                STRICT RULES:
                - Return EXACTLY one result per phrase
                - Preserve phrase text EXACTLY
                - Score from 0 to 100
                - RECOMMENDED: score ≥ 70
                - RISKY: score 40–69
                - OUTDATED: score < 40
                - Select 1–3 signals ONLY from the allowed list
                - NO explanations
                - JSON ONLY
                `;

            let parsed = null;

            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    response_format: {
                        type: "json_schema",
                        json_schema: evalSchema
                    },
                    messages: [{
                        role: "system",
                        content: "Return strict JSON only. Do not add commentary."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                    ],
                    temperature: 0.1,
                    max_tokens: 700
                });

                const raw = response.choices?.[0]?.message?.content || "";

                try {
                    parsed = JSON.parse(raw);
                    break;
                } catch {
                    if (attempt === 1) {
                        throw new Error("Chunk evaluation failed");
                    }
                }
            }

            finalResults.push(...parsed.results);
        }

        return res.json({
            results: finalResults
        });

    } catch (err) {
        console.error("Idea Evaluation Error:", err);
        return res.status(500).json({
            error: "AI error",
            detail: err.message || "Evaluation failed"
        });
    }
});




app.post("/api/ai/design-prompt", async (req, res) => {
    try {
        const {
            idea,
            phrase,
            style_direction,
            font_pairing,
            color_palette,
            layout,
            illustration,
            texture,
            products,
            mockup_prompt,
            seo_title,
            tags
        } = req.body;

        if (!phrase) {
            return res.status(400).json({
                error: "Missing phrase"
            });
        }

        const promptSchema = {
            name: "DesignPrompt",
            schema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string"
                    }
                },
                required: ["prompt"]
            }
        };
        console.log("Generating design prompt for phrase:", idea);
        const userPrompt = `
            Create ONE highly descriptive, production-ready design prompt for a Print-on-Demand graphic.

Describe ONLY the printed artwork itself. Do not describe mockups, scenes, people, environments, props, or photography.

PRIMARY RULE
The creative idea controls the entire design. The phrase must adapt to the idea. Do not soften, reinterpret, or replace the idea with a different theme.

User Idea (this controls tone, message, visuals, and mood):
"${idea}"

The final prompt must explicitly include the idea keyword exactly as written above so the theme is unmistakable.

Integrate the structured design details so they support the idea instead of competing with it:

Phrase: "${phrase}"

Style Direction: The style is ${style_direction}, but it must clearly communicate the idea, so the viewer instantly understands the theme at first glance.

Font Pairing: Use ${font_pairing} as the primary typography system. Build hierarchy that matches the emotional tone of the idea, using contrast, scale, spacing, and weight to emphasize important words.

Color Palette: Use ${color_palette}. Colors must reinforce the emotional meaning of the idea while maintaining strong print contrast and clarity.

Layout: Use a ${layout} composition. Keep the phrase as the visual anchor, centered and balanced so it prints stable on apparel and merchandise.

Illustration Elements: Add ${illustration} only if they directly support the idea. Keep shapes vector-clean, integrated with typography, intentional, and never louder than the phrase.

Texture Feel: Apply ${texture} lightly to add depth without reducing sharpness or legibility.

Target Products: ${products}

────────────────────────
🎨 BACKGROUND RULE (CRITICAL)
────────────────────────
The design must use only one flat background, either:

• pure white (#FFFFFF)
or
• pure black (#000000)

Choose whichever creates the strongest possible contrast with the design colors and typography so the artwork remains bold, readable, and print-ready.

No gradients.
No shadows.
No scenery.
No patterns.
No frames.
No decorative backdrops.

────────────────────────
STRICT DESIGN RULES
────────────────────────
• The idea controls style, typography, shapes, icons, and layout
• The idea keyword must appear clearly in the final prompt
• Focus ONLY on the printed graphic
• Plain white or black background only, high contrast
• No mockups, props, people, rooms, tables, lighting, or environment
• Describe typography hierarchy, shaping, spacing, and composition
• Describe illustration shape language and integration with type
• Describe color contrast relationships, not random colors
• Texture is subtle and supportive, never dominant

DO NOT:
• change or reinterpret the idea
• describe cameras, lenses, lighting, staging, or photography
• output explanations, lists, or JSON
• write multiple prompts

Write as ONE rich cinematic paragraph for commercial POD production.

Final quality intent:
High-quality vector, sharp edges, bold graphic, commercial POD ready, premium typography, balanced composition, crisp print clarity, modern professional finish.

        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: {
                type: "json_schema",
                json_schema: promptSchema
            },
            messages: [{
                role: "system",
                content: "You are an expert creative director for POD design prompts."
            },
            {
                role: "user",
                content: userPrompt
            }
            ],
            temperature: 0.6,
            max_tokens: 600
        });

        const json = response.choices[0].message.content;
        res.json(JSON.parse(json));

    } catch (err) {
        console.error("Design Prompt Error:", err);
        res.status(500).json({
            error: "AI error",
            detail: err?.message
        });
    }
});

app.post("/api/ai/design-variation", async (req, res) => {
    try {
        const {
            phrase,
            idea,
            keyword,
            illustration
        } = req.body;

        const prompt = `
You are rewriting and refining a print-on-demand artwork concept.

Your task is to produce ONE cinematic, commercial-ready POD design description.

TEXT RULES (ABSOLUTE)
- The ONLY text visible in the artwork must be exactly: "${phrase}"
- Do NOT add, paraphrase, imply, or reference any other text.
- Do NOT describe any text other than "${phrase}".
- "${phrase}" must be the clear visual focal point of the design.

IDEA & THEME RULES
- The idea defines mood, emotion, and storytelling direction ONLY.
- The idea must NOT introduce scenery, objects, environments, or extra visuals.
- Any visual objects mentioned in the idea must be ignored unless they match the illustration exactly.
- The phrase must replace all conceptual meaning from the idea.

ILLUSTRATION RULES (STRICT)
- Use ONLY the illustration defined here: ${illustration}
- Do NOT add additional characters, scenery, symbols, or environments.
- Do NOT reinterpret the idea as visual elements.
- The illustration must support the phrase, not compete with it.
- Clean, bold, vector-friendly shapes only.

STYLE RULES
- ${keyword} controls graphic style ONLY (line quality, rendering approach, visual vibe).
- Do NOT turn the keyword into story, theme, or symbolism.
- Cinematic feeling must come from composition and contrast, not extra elements.

BACKGROUND RULE (CRITICAL)
- Use ONE flat background color only:
  • pure white (#FFFFFF)
  OR
  • pure black (#000000)
- No gradients.
- No shadows.
- No scenery.
- No textures.
- No patterns.

MERGE INSTRUCTIONS
Write ONE flowing paragraph that:
- Describes only the artwork itself
- Makes "${phrase}" the hero
- Includes the illustration once
- Feels premium, cinematic, and print-ready
- Uses restrained, commercial language

QUALITY TARGET
High-quality vector feel, sharp edges, bold clarity, balanced composition, premium POD-ready artwork.
`;

        const r = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: "You rewrite design prompts professionally."
            },
            {
                role: "user",
                content: prompt
            }
            ]
        });

        res.json({
            prompt: r.choices[0].message.content
        });

    } catch (err) {
        res.status(500).json({
            error: "variation failed"
        });
    }
});



app.post("/api/ai/design-new-variation", async (req, res) => {

    try {

        const { ideaText } = req.body;

        const prompt = `
You are an elite Print-On-Demand concept designer generating NEW commercial artwork concepts.

TASK
Create ONE brand-new POD design concept inspired by the source prompt.

GOAL
Generate a fresh concept variation every time.
Each result must feel different in composition, hierarchy, mood, visual treatment, and design execution.

PRESERVE (LOCKED ELEMENTS)
- Keep Phrase 1 exactly as written.
- Keep Phrase 2 exactly as written.
- Keep all required illustration elements from the source prompt.
- Keep the original thematic intent and emotional meaning.
- if Phrase 1 and Phrase 2 are missing, remove all prompt that related to text. Only keep the illustration and the idea. Do not add new text.

ALLOWED TO CHANGE
You may reinvent:
- Layout composition
- Typography treatment
- Phrase hierarchy
- Graphic balance
- Negative space usage
- Visual emphasis
- Style execution
- Artistic direction
- Commercial POD presentation approach

DO NOT
- Do not alter either phrase.
- Do not remove required illustration elements.
- Do not add unrelated objects, symbols, scenery, characters, or environments.
- Do not repeat or lightly reword the original concept.
- Do not generate generic filler.
- Do not describe mockups or products.
- Do not mention t-shirts, apparel, or merchandise.

STYLE TARGET
Generate a premium POD-ready concept with:
- strong visual hook
- bold vector-friendly clarity
- clean scalable artwork logic
- high commercial appeal
- cinematic composition
- balanced contrast
- sharp print-ready execution

OUTPUT FORMAT
Write ONE flowing paragraph describing only the artwork concept.

MANDATORY
Every generation must produce a genuinely new concept, not a wording variation.

Source prompt:

        ${ideaText}
        `;

        const r = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You professionally refine POD prompts without changing meaning."
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        res.json({
            prompt: r.choices[0].message.content
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "variation failed"
        });

    }

});


app.use(cors());

app.post("/api/upload-to-drive", upload.array("files"), async (req, res) => {
    const clientName = req.body.clientName;
    const files = req.files;
    // files = ["images/temp7.png", "images/temp8.png"]

    if (!files || !files.length) {
        return res.status(400).json({
            error: "No files uploaded"
        });
    }

    try {
        // 1. Create client folder
        const ROOT_FOLDER = "1npiS8FV5OS1Asd7yXY5lirK4nRBK0G2W";

        // 1️⃣ ensure today's folder exists
        const dateName = todayFolder();
        let dateFolder = await findFolderByName(dateName, ROOT_FOLDER);

        if (!dateFolder) {
            dateFolder = {
                id: await createDriveFolder(dateName, ROOT_FOLDER)
            };
        }

        const dateFolderId = dateFolder.id;


        // 2️⃣ create client folder inside today
        const clientFolderId = await createDriveFolder(
            clientName || "Client-" + Date.now(),
            dateFolderId
        );



        // 2. Zip files
        const zipName = `${clientName || "client"}-${uuidv4()}.zip`;
        const zipPath = path.join(process.cwd(), zipName);

        await zipFiles(files, zipPath);


        files.forEach(f => fs.unlinkSync(f.path));



        // 3. Upload zip
        // Upload ZIP
        const result = await uploadToDrive(zipPath, zipName, clientFolderId);

        // Generate branded PDF using Drive folder link
        const pdfPath = await generateDownloadPDF(
            `https://drive.google.com/drive/folders/${clientFolderId}`,
            clientName || "client"
        );

        // Upload PDF to Drive
        const pdfUpload = await uploadToDrive(
            pdfPath,
            `${clientName || "client"}-download.pdf`,
            clientFolderId
        );

        // Clean local PDF
        fs.unlinkSync(pdfPath);



        // 4. Clean up
        fs.unlinkSync(zipPath);

        // 5. Send response ONCE
        res.json({
            success: true,
            zip: {
                download: result.download,
                view: result.view
            },
            pdf: {
                download: pdfUpload.download,
                view: pdfUpload.view
            },
            folder: `https://drive.google.com/drive/folders/${clientFolderId}`
        });




    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Upload failed"
        });
    }
});

app.use(express.json());



async function zipFiles(files, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", {
            zlib: {
                level: 9
            }
        });

        output.on("close", resolve);
        archive.on("error", reject);

        archive.pipe(output);

        files.forEach(file => {
            archive.file(file.path, {
                name: file.originalname
            });
        });

        archive.finalize();
    });
}


app.get("/api/drive-status", (req, res) => {
    res.json({
        ready: isDriveReady()
    });
});


async function generateDownloadPDF(driveLink, clientName) {
    const templatePath = path.join(process.cwd(), "pdf_template", "download_template.html");
    let html = fs.readFileSync(templatePath, "utf8");

    // Replace both placeholders
    html = html.replaceAll("YOUR_DRIVE_LINK_HERE", driveLink);
    html = html.replaceAll(
        "https://drive.google.com/drive/folders/YOUR_FOLDER_ID",
        driveLink
    );

    const pdfPath = path.join(
        process.cwd(),
        "temp_uploads",
        `${clientName}-download.pdf`
    );

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(html, {
        waitUntil: "networkidle0"
    });
    await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true
    });

    await browser.close();

    return pdfPath;
}


app.use("/temp_uploads", express.static("temp_uploads"));

app.get('/health', (req, res) => res.json({
    ok: true
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI proxy server running on ${PORT}`));



app.post("/api/ai/clipart-stock", async (req, res) => {
    let cloneStyleBlock = "";

    const {
        title,
        keywords,
        category,
        quantity = 1,
        cloneprompt = ""
    } = req.body;

    const cleanedClonePrompt = String(cloneprompt || "").trim();


    if (cleanedClonePrompt) {

        cloneStyleBlock = `
REFERENCE STYLE:
${cleanedClonePrompt}

STYLE DNA RECONSTRUCTION RULES:

Deeply analyze the reference prompt and reconstruct its visual design language in high detail.

The new artwork must preserve the SAME:

- illustration density
- mascot anatomy style
- silhouette complexity
- facial construction
- eye styling
- mouth styling
- accessory scale
- pose energy
- object interaction
- composition rhythm
- visual balance
- background simplicity
- outline thickness
- line smoothness
- cel shading behavior
- color distribution
- shape language
- emotional atmosphere
- vector cleanliness
- commercial mascot polish
- sticker-pack readability
- flat illustration structure
- graphic design aesthetic

The generated prompt should feel like:
- a different character from the SAME illustrator
- part of the SAME mascot collection
- the SAME visual product line
- the SAME commercial sticker universe

IMPORTANT:
Do NOT summarize the style briefly.

The generated prompt must contain rich visual reconstruction detail similar in density and specificity to the reference prompt itself.

The final prompt should mirror the reference prompt's:
- descriptive depth
- visual pacing
- detail density
- stylistic layering
- rendering specificity
- composition structure

Preserve the MASTER STYLE.

Change ONLY:
- the subject identity
- object theme
- accessory theme

NOT:
- the illustration language.
`;
    }
    const keywordArray = Array.isArray(keywords)
        ? keywords
        : String(keywords || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

    const keywordText = keywordArray.join(", ");

    const prompt = `
You are a senior commercial vector art director specializing in Adobe Stock mascot illustration systems.

Generate ${quantity} unique commercial Adobe Stock clipart concepts.

${cloneStyleBlock}

SOURCE INFORMATION:
- Title: ${title || ""}
- Keywords: ${keywordText}
- Category: ${category || ""}

SUBJECT CONSISTENCY RULES:

The user-provided subject is mandatory and must remain visually dominant.

The generated concept must clearly match:
- title
- keywords
- category
- requested animal/object/character

Do not:
- replace the species
- invent unrelated animals
- substitute mascot archetypes
- introduce unrelated character identities

Avoid introducing unrelated animals or mascot archetypes not present in the source metadata.

Style transfer should affect ONLY:
- rendering style
- outline behavior
- color treatment
- composition quality
- shading logic
- illustration aesthetics

NOT:
- the core subject identity.

CLIPART STYLE RULES:
- clean vector illustration
- flat modern design
- isolated object composition
- transparent or white background
- commercially useful
- scalable SVG-friendly design
- clean edges
- visually simplified but descriptively rich illustration design
- high readability at thumbnail size
- premium commercial mascot quality

VISUAL RULES:
- avoid realistic photography
- avoid cinematic lighting
- avoid DSLR language
- avoid environmental storytelling
- avoid realistic shadows
- avoid movie scene composition
- avoid complex backgrounds
- avoid photorealism
- avoid painterly realism
- avoid cinematic realism

VECTOR CLEANLINESS:

Shapes should feel:
- production-ready
- print-friendly
- scalable
- visually simplified
- edge-clean
- commercially polished
- vector-friendly
- easy to isolate
- suitable for transparent PNG export

Avoid:
- messy texture noise
- AI watercolor artifacts
- fuzzy rendering
- excessive detail clutter
- inconsistent line thickness
- blurry edges
- low-resolution appearance

COMMERCIAL STOCK SAFETY:

Avoid:
- copyrighted characters
- famous mascots
- anime franchise similarity
- recognizable game styles
- Disney-like proportions
- Pixar-like rendering
- trademarked symbols
- logos
- readable text
- branded accessories
- licensed visual identities
- recognizable intellectual property

All characters must feel:
- original
- commercially safe
- unique but broadly usable
- stock-friendly
- commercially licensable

ADOBE STOCK OPTIMIZATION:

The illustration should feel commercially searchable and broadly usable.

Prioritize:
- clean subject clarity
- strong silhouette readability
- isolated composition
- stock marketplace appeal
- printable sticker aesthetic
- scalable commercial usability
- premium vector pack quality
- strong thumbnail readability

The concept should work for:
- stickers
- t-shirts
- planners
- sublimation
- digital downloads
- educational graphics
- social media assets
- print-on-demand products
- Cricut projects

UNIQUENESS RULES:

Avoid generating:
- generic marketplace clipart
- repetitive mascot poses
- common Etsy-style clichés
- overused kawaii expressions
- identical composition structures
- repetitive stock mascots

Each concept should contain:
- unique personality
- distinct accessory choices
- different emotional energy
- memorable silhouette identity
- visually recognizable shape language
- clear visual differentiation

COLOR RULES:
- commercially balanced color palette
- clean visual separation
- harmonious but readable colors
- print-friendly contrast
- polished modern color styling

Avoid:
- oversaturated rainbow palettes
- muddy color combinations
- neon overload
- dull low-energy palettes

DETAIL DENSITY RULES:

The generated prompt should explicitly describe:
- subject pose
- facial expression
- body posture
- accessory interaction
- background structure
- composition placement
- silhouette readability
- color palette structure
- outline behavior
- shading placement
- visual depth treatment
- emotional tone
- graphic balance
- decorative elements
- vector rendering style

Avoid:
- compressed one-line prompts
- generic descriptions
- vague mascot wording
- low-detail summaries

The prompt should:
- feel visually complete
- feel production-ready
- resemble a professional art director brief
- contain rich visual direction

The output prompt should typically be 120 to 250 words long.

METADATA CONSISTENCY:

The generated artwork must visually match:
- the title
- the keywords
- the category

Buyers should instantly understand the subject without reading metadata.

DESCRIPTION RULES:

The description must:
- be short and commercially searchable
- summarize the illustration clearly
- feel like Adobe Stock metadata
- contain approximately 80 to 120 characters
- avoid unnecessary adjectives
- avoid storytelling language
- avoid repeating the full prompt

Good description examples:
- Cute fox mascot holding coffee mug in flat vector illustration style
- Playful panda cartoon character with bamboo in sticker art style
- Kawaii cat mascot drinking tea in clean vector illustration

Avoid:
- long descriptive paragraphs
- cinematic writing
- emotional storytelling
- art-director language
- repeating every visual detail


KEYWORD RULES:
- generate 45 to 49 Adobe Stock keywords
- no duplicates
- prioritize SEO discoverability
- most important keywords first
- include commercial search intent
- include illustration-related discoverability
- include object/category descriptors
- include usage-related keywords

Return ONLY valid JSON.

OUTPUT FORMAT:
{
  "results":[
    {
      "title":"",
      "keywords":[],
      "description":"",
      "prompt":""
    }
  ]
}
`;

    try {

        const r = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.68,
            max_tokens: 1800,
            response_format: {
                type: "json_object"
            },
            messages: [
                {
                    role: "system",
                    content: "You generate Adobe Stock clipart prompts."
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        const parsed = JSON.parse(
            r.choices[0].message.content
        );

        res.json(parsed);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

app.post("/api/ai/adobe-stock", async (req, res) => {

    const {
        title,
        keywords,
        category,
        quantity = 1,
        mode = "default",
        cloneprompt = ""
    } = req.body;

    // --------------------------------------
    // 🧠 CORE ENGINE
    // --------------------------------------

    const coreEngine = `
You are a world-class Adobe Stock photographer, cinematic visual storyteller, and luxury commercial art director.

Create emotionally authentic, commercially valuable, visually distinctive imagery that feels professionally photographed rather than AI-generated.

CORE RULES:
- prioritize storytelling over generic beauty
- create believable lived moments
- environments must feel physically real
- naturalistic photographic realism with emotional depth grounded in authentic photography
- compositions must feel observational, not staged
- variation between outputs must be significant

VISUAL STYLE:
- documentary-inspired visual realism
- documentary authenticity
- layered environmental depth
- natural optical behavior
- emotionally grounded framing

TECHNICAL REQUIREMENTS:
- razor sharp subject focus
- realistic anatomy
- natural textures
- physically believable lighting
- balanced exposure
- zero AI artifacts

STRICTLY AVOID:
- generic stock compositions
- plastic skin
- warped anatomy
- repetitive framing
- centered catalog compositions unless product-focused
- vague cinematic adjectives
- over-stylized AI aesthetics

The image must feel:
- authentic
- cinematic
- visually rich
- commercially licensable
- professionally photographed


If the image feels generic, repetitive, artificial, or AI-generated:
→ REGENERATE COMPLETELY
`;

    const realismGuard = `
REALISM LANGUAGE RULES:

Avoid abstract cinematic language such as:
- cinematic
- immersive
- authentic atmosphere
- emotional realism
- visually rich
- dramatic mood
- storytelling composition

Instead:
describe only physically observable details.

Focus on:
- surfaces
- materials
- lighting behavior
- spatial layering
- environmental interaction
- body posture
- framing imperfections
- object placement
- weather interaction
- motion behavior

Write like:
- a street photographer describing a captured frame
NOT:
- a film director pitching a scene
`;

    // --------------------------------------
    // 🧩 MODULES
    // --------------------------------------

    const modeModule = getModeModule(mode, cloneprompt, title, keywords);
    const qualityModule = getQualityModule("ultra");
    const styleModule = getStyleModule("lifestyle"); //more option
    const cameraModule = getCameraModule("realismGuard");
    const observationModule = getObservationModule("documentary");
    const ipsafetyModule = getIPSafetyModule();


    // --------------------------------------
    // 🎬 OUTPUT REQUIREMENTS
    // --------------------------------------

    const outputRequirements = `
    OUTPUT REQUIREMENTS:

    The final output must read like:
    - a cinematographer shot brief
    - a luxury commercial photography direction
    - slightly uneven framing through passing pedestrians

    Each generated prompt MUST explicitly describe:
    - camera angle
    - camera height
    - lens focal behavior
    - framing composition
    - focus hierarchy
    - subject sharpness priority
    - foreground/background layering
    - environmental depth
    - atmospheric motion
    - lighting interaction
    - optical realism
    - cinematic perspective

    The writing must feel:
    - visually dense
    - emotionally immersive
    - environmentally rich
    - optically believable

    Minimum length:
    180 to 350 words per prompt.

    Avoid:
    - short summaries
    - compressed prose
    - generic scene descriptions
    - vague cinematic wording
    - broad adjectives without visual detail

    Scenes should contain sensory realism including:
    - humidity lightly diffusing distant neon reflections
    - temperature cues
    - material textures
    - atmospheric density
    - tactile surfaces
    - environmental residue
    - physical weather interaction
    - subtle imperfections

    The environment must feel physically inhabitable.

    Human subjects should display:
    - natural posture variation
    - imperfect body positioning
    - candid interaction
    - distracted moments
    - subtle emotional expression
    - believable physical behavior

    Avoid:
    - direct posing
    - perfect posture
    - exaggerated cinematic emotion
    - symmetrical body arrangement

    `;

    const culturalConsistencyModule = `
CULTURAL + METADATA CONSISTENCY RULES:

All visual elements must remain fully consistent with the metadata keywords, title, and location context.

If the metadata references a specific country, culture, city, ethnicity, or region, the generated image must accurately reflect that identity through realistic environmental and human details.

This includes:
- architecture
- people
- facial features
- clothing
- transportation
- food
- weather
- lighting behavior
- atmosphere
- urban density
- environmental materials
- street layout
- cultural interactions
- lifestyle details

The environment must feel geographically believable and culturally coherent.

Avoid:
- generic international aesthetics
- mixed Asian visual language
- tourism-poster exaggeration
- incorrect cultural blending
- artificial cinematic beautification

The generated image must visually match the metadata so buyers instantly recognize the location and cultural identity without needing to read the title or keywords.

Scenes should feel naturally observed rather than designed for tourism advertising.
`;

    // --------------------------------------
    // 📦 FINAL PROMPT
    // --------------------------------------
    const clipartCoreEngine = `
You are a world-class kawaii mascot illustrator and Adobe Stock vector artist.

Create premium commercial clipart illustrations optimized for:
- sticker packs
- mascot branding
- POD products
- Adobe Stock vector collections

STYLE GOALS:
- flat 2D illustration
- thick smooth outlines
- kawaii mascot proportions
- expressive cute characters
- clean vector edges
- soft cel shading
- centered composition
- isolated subject readability

STRICTLY AVOID:
- photography
- realism
- cinematic lenses
- documentary style
- environmental realism
- camera language
- optical realism
`;
    const isClipart = mode === "clipart";

    const hasClonePrompt =
        cloneprompt &&
        cloneprompt.trim().length > 0;

    const prompt = `
${mode === "clipart"
            ? clipartCoreEngine
            : coreEngine}

${modeModule}

${qualityModule}

${styleModule}

${mode === "clipart"
            ? ""
            : culturalConsistencyModule}

${mode === "clipart"
            ? ""
            : cameraModule}

${outputRequirements}

${mode === "clipart"
            ? ""
            : observationModule}

${ipsafetyModule}

--------------------------------------
INPUT
--------------------------------------

Generate EXACTLY ${quantity} Adobe Stock prompts.

TITLE:
${title}

KEYWORDS:
${keywords || "auto-generate"}

CATEGORY:
${category}

${mode === "clipart"
            ? `
🎨 CLIPART RULES:

The artwork must look like:
- premium kawaii mascot illustration
- clean vector clipart
- sticker-art quality
- flat 2D commercial artwork
- Adobe Illustrator aesthetic
- cute simplified character design

STYLE REQUIREMENTS:
- thick smooth outlines
- clean silhouette readability
- centered composition
- isolated subject
- soft cel shading
- simplified cute proportions
- expressive mascot emotions
- thumbnail-friendly readability

STRICTLY AVOID:
- photography
- cameras
- realism
- cinematic shots
- documentary realism
- environmental storytelling
- realistic lighting
- realistic fur texture
- depth of field
- cinematic lenses
- film still composition
- urban realism

KEYWORD RULES:
Generate EXACTLY between 35 and 45 keywords.

Keywords should focus on:
- mascot
- clipart
- kawaii
- vector
- cartoon
- sticker
- illustration
- cute character
- isolated object
- flat design
- commercial artwork

DO NOT include:
- photography keywords
- camera keywords
- documentary keywords
- realism keywords
`
            : `
📸 REALISM RULES:

The image must look like:
- a real professional photoshoot
- naturally captured
- visually immersive
- emotionally authentic
- commercially valuable

Every image must capture:
- a specific lived moment
- authentic environmental interaction
- cinematic visual storytelling
- believable human realism

The final image should feel like:
- a remembered real moment
- a captured human experience
- an emotionally authentic observation

NOT:
- an AI-generated concept illustration
- a generic stock composition
- a staged cinematic render

────────────────────────
KEYWORD RULES
────────────────────────

Generate EXACTLY between 45 and 49 Adobe Stock keywords.

Keywords must include:
- subject keywords
- environment keywords
- emotion keywords
- documentary realism keywords
- lighting keywords
- travel/culture keywords
`
        }

Return ONLY valid JSON.

FORMAT:
{
  "results": [
    {
      "title": "",
      "keywords": [],
      "description": "",
      "prompt": ""
    }
  ]
}
`;

    // --------------------------------------
    // 🚀 OPENAI CALL
    // --------------------------------------

    const r = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.85,
        max_tokens: 3400,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: "You are an elite cinematic visual director and Adobe Stock photography prompt engineer."
            },
            {
                role: "user",
                content: prompt
            }
        ]
    });

    // --------------------------------------
    // 🧹 CLEAN RESPONSE
    // --------------------------------------

    const raw = r.choices[0].message.content;

    let parsed;

    try {
        parsed = JSON.parse(raw);
    } catch (err) {

        const cleaned = raw
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0];

        if (!extracted) {
            console.error("❌ Invalid JSON");
            console.log(raw);
            throw new Error("Invalid AI response");
        }

        parsed = JSON.parse(extracted);
    }

    res.json(parsed);
});

function cleanJSON(text) {
    return text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
}

function extractJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
}


import XLSX from "xlsx";


app.use(express.json()); // 🔥 MUST HAVE

app.post("/api/export-excel", (req, res) => {
    try {
        const { data } = req.body;

        if (!data || !data.length) {
            return res.status(400).send("No data");
        }

        const rows = data.map(item => ({
            Prompt: item.prompt || "",
            Title: item.title || "",
            Keywords: Array.isArray(item.keywords)
                ? item.keywords.join(", ")
                : "",
            Description: item.description || "",
            Category: item.category || ""
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, ws, "Adobe");

        const filePath = path.join(process.cwd(), "adobe_export.xlsx");

        XLSX.writeFile(wb, filePath);

        res.download(filePath);

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});


function getModeModule(mode, cloneprompt = "", title, keywords) {

    const cleanedClonePrompt = cloneprompt
        .replace(/camera[^,.\n]*/gi, "")
        .replace(/lens[^,.\n]*/gi, "")
        .replace(/golden hour/gi, "")
        .replace(/depth of field/gi, "")
        .replace(/realistic/gi, "")
        .replace(/photography/gi, "")
        .replace(/cinematic/gi, "")
        .replace(/documentary/gi, "")
        .replace(/real life/gi, "")
        .replace(/sharp focus/gi, "")
        .replace(/4k resolution/gi, "")
        .replace(/studio lighting/gi, "")
        .replace(/physical realism/gi, "")
        .trim();

    // --------------------------------------
    // 🎬 DEFAULT CINEMATIC MODE
    // --------------------------------------

    if (mode === "default") {
        return `
MODE: CINEMATIC STORYTELLING

Create authentic cinematic photography with emotional realism and environmental storytelling.

SCENE RULES:
- scenes must feel naturally lived-in
- subjects should interact with the environment
- moments should feel candid, not posed
- storytelling must feel emotionally grounded
- composition should feel immersive and observational

VISUAL DIRECTION:
- documentary-style realism
- layered foreground/background depth
- subtle atmospheric details
- natural environmental imperfections
- believable motion and interaction
- intimate cinematic framing

ENVIRONMENTAL DETAILS:
- weather interaction
- humidity lightly diffusing distant neon reflections
- fabric movement
- realistic reflections
- atmospheric particles
- authentic texture variation

ALLOWED COMPOSITIONS:
- rule of thirds
- asymmetrical framing
- environmental storytelling
- close intimate framing
- layered perspective depth

AVOID:
- centered catalog compositions
- empty backgrounds
- frozen poses
- sterile perfection
- generic stock scenes
- artificial symmetry
`;
    }

    // --------------------------------------
    // ⚪ ISOLATED PRODUCT MODE
    // --------------------------------------

    if (mode === "isolated") {
        return `
MODE: ISOLATED PRODUCT PHOTOGRAPHY

Create premium commercial product photography designed for stock marketplaces and e-commerce usage.

SCENE RULES:
- single hero object only
- pure white background
- clean silhouette
- minimal composition
- product-focused presentation

BACKGROUND RULES:
- RGB(255,255,255) pure white
- no visible environment
- no horizon line
- no floor texture
- no gradients
- no vignette

LIGHTING:
- soft commercial studio lighting
- controlled highlights
- subtle contact shadow only
- realistic material reflections
- balanced exposure

VISUAL STYLE:
- premium commercial realism
- luxury product presentation
- sharp detail rendering
- realistic textures
- elegant simplicity

AVOID:
- storytelling environments
- dramatic cinematic lighting
- clutter
- props unless required
- colored shadows
- reflective floors
- environmental backgrounds
`;
    }


    // --------------------------------------
    // 📰 EDITORIAL DOCUMENTARY MODE
    // --------------------------------------

    if (mode === "editorial") {
        return `
MODE: EDITORIAL DOCUMENTARY PHOTOGRAPHY

Create emotionally authentic editorial photography that feels captured during a real human moment.

VISUAL STYLE:
- photojournalistic realism
- documentary atmosphere
- observational storytelling
- raw emotional authenticity
- cinematic naturalism

SCENE RULES:
- imperfect real-world environments
- candid interactions
- layered social context
- environmental storytelling
- emotionally believable moments

CAMERA FEEL:
- handheld realism
- natural framing
- spontaneous composition
- immersive perspective

AVOID:
- luxury commercial polish
- over-staging
- perfect symmetry
- artificial posing
- hyper-clean environments
`;
    }

    // --------------------------------------
    // 👗 FASHION EDITORIAL MODE
    // --------------------------------------

    if (mode === "fashion") {
        return `
MODE: FASHION EDITORIAL

Create cinematic fashion photography with strong mood, texture, and visual identity.

VISUAL STYLE:
- luxury editorial atmosphere
- cinematic fashion realism
- elegant emotional tension
- magazine-style storytelling
- sophisticated color harmony

SCENE RULES:
- expressive styling
- intentional body language
- atmospheric environments
- layered lighting depth
- subtle emotional narrative

COMPOSITION:
- dynamic framing
- negative space balance
- dramatic silhouette control
- immersive perspective layering

AVOID:
- generic catalog poses
- flat lighting
- fast-fashion aesthetic
- repetitive styling
- sterile studio appearance
`;
    }

    // --------------------------------------
    // 🔥 FALLBACK MODE
    // --------------------------------------

    return `
MODE: GENERAL CINEMATIC REALISM

Create visually authentic, commercially valuable imagery with natural storytelling and cinematic realism.
`;
}


function getQualityModule(level = "high") {

    // --------------------------------------
    // ⚡ STANDARD QUALITY
    // --------------------------------------

    if (level === "standard") {
        return `
QUALITY LEVEL: STANDARD

QUALITY RULES:
- clean composition
- sharp focus
- realistic anatomy
- balanced exposure
- natural lighting
- realistic textures

AVOID:
- blurry details
- obvious AI artifacts
- distorted anatomy
- excessive noise
- poor lighting balance
`;
    }

    // --------------------------------------
    // 🔥 HIGH QUALITY
    // --------------------------------------

    if (level === "high") {
        return `
QUALITY LEVEL: HIGH

TECHNICAL REQUIREMENTS:
- ultra high resolution
- razor sharp focus
- realistic micro-details
- physically accurate textures
- natural depth of field
- balanced dynamic range
- professional exposure control

TEXTURE REALISM:
- natural skin texture
- authentic fabric detail
- realistic wood grain
- believable reflections
- organic surface imperfections

LIGHTING QUALITY:
- physically believable lighting
- soft natural shadow transitions
- realistic highlight rolloff
- controlled contrast
- cinematic but natural illumination

STRICTLY AVOID:
- plastic skin
- over-smoothing
- excessive sharpening
- burned highlights
- crushed blacks
- muddy shadows
- unrealistic reflections
- fake HDR appearance
- artificial texture repetition

ANATOMY RULES:
- correct fingers and hands
- natural facial structure
- realistic body proportions
- believable posture and movement

The image must pass professional stock inspection at 200% zoom.
`;
    }

    // --------------------------------------
    // 🏆 ULTRA / ADOBE STOCK SAFE
    // --------------------------------------

    if (level === "ultra") {
        return `
QUALITY LEVEL: ULTRA COMMERCIAL

This image must meet premium Adobe Stock commercial standards.

ULTRA TECHNICAL REQUIREMENTS:
- extremely sharp critical focus
- flawless texture rendering
- physically realistic materials
- cinematic optical realism
- zero rendering artifacts
- professional-grade detail separation
- ultra-clean edge definition

MICRO DETAIL REQUIREMENTS:
- visible skin pores
- realistic hair strand separation
- authentic fabric weave
- natural environmental wear
- organic texture variation
- physically accurate material response

LIGHTING REQUIREMENTS:
- realistic directional lighting
- natural shadow behavior
- believable light falloff
- controlled highlight retention
- cinematic dynamic range
- physically plausible reflections

IMAGE INTEGRITY:
- no duplicated objects
- no warped structures
- no malformed anatomy
- no floating elements
- no texture smearing
- no ghosting artifacts
- no unnatural symmetry

STRICTLY FORBIDDEN:
- AI-looking perfection
- waxy skin
- fake sharpness
- oversaturated grading
- synthetic textures
- unrealistic eyes
- distorted fingers
- melted details
- blurry micro-contrast
- fake bokeh artifacts

The final image must feel:
- captured with a professional full-frame camera
- naturally lit and optically believable
- commercially licensable
- indistinguishable from real photography

If any visual artifact appears:
→ REGENERATE COMPLETELY
`;
    }

    // --------------------------------------
    // 🧼 MINIMAL FALLBACK
    // --------------------------------------

    return `
QUALITY RULES:
- sharp focus
- realistic anatomy
- clean lighting
- natural textures
- no AI artifacts
`;
}


function getStyleModule(style = "cinematic") {

    // --------------------------------------
    // 🎬 CINEMATIC REALISM
    // --------------------------------------

    if (style === "cinematic") {
        return `
STYLE: CINEMATIC REALISM

VISUAL TONE:
- authentic cinematic atmosphere
- emotionally grounded realism
- natural visual storytelling
- restrained cinematic grading
- subtle dramatic depth

COLOR SCIENCE:
- Kodak Portra inspired tones
- natural skin rendering
- filmic highlight rolloff
- subtle shadow separation
- restrained saturation

LIGHTING STYLE:
- natural directional light
- soft environmental shadows
- realistic light falloff
- atmospheric depth lighting
- cinematic but believable illumination

CAMERA FEEL:
- full-frame photography realism
- natural optical depth
- intimate framing
- immersive perspective layering

AVOID:
- fake HDR
- fantasy color grading
- oversaturated colors
- artificial sharpness
- synthetic AI beauty
`;
    }

    // --------------------------------------
    // 📰 DOCUMENTARY
    // --------------------------------------

    if (style === "documentary") {
        return `
STYLE: DOCUMENTARY REALISM

VISUAL TONE:
- observational photography
- emotionally authentic realism
- candid atmosphere
- raw environmental storytelling
- immersive real-world texture

LIGHTING:
- natural available light
- imperfect environmental lighting
- realistic exposure variation
- subtle atmospheric haze

CAMERA FEEL:
- handheld realism
- spontaneous framing
- authentic perspective
- lived-in composition

ENVIRONMENT:
- subtle imperfections
- environmental wear
- authentic textures
- naturally layered depth

AVOID:
- polished luxury aesthetics
- overly cinematic grading
- artificial posing
- sterile environments
`;
    }

    // --------------------------------------
    // 👗 FASHION EDITORIAL
    // --------------------------------------

    if (style === "fashion") {
        return `
STYLE: FASHION EDITORIAL

VISUAL TONE:
- luxury editorial realism
- elegant cinematic mood
- expressive styling
- emotionally sophisticated atmosphere
- modern fashion storytelling

COLOR STYLE:
- refined color harmony
- premium tonal separation
- cinematic contrast
- soft skin rendering
- elegant material textures

LIGHTING:
- dramatic soft lighting
- sculpted facial shadows
- controlled highlight depth
- fashion magazine atmosphere

COMPOSITION:
- intentional framing
- negative space balance
- dynamic body positioning
- layered visual rhythm

AVOID:
- catalog photography
- flat commercial lighting
- repetitive posing
- generic fast-fashion aesthetics
`;
    }

    // --------------------------------------
    // 🌿 NATURAL LIFESTYLE
    // --------------------------------------

    if (style === "lifestyle") {
        return `
STYLE: NATURAL LIFESTYLE

VISUAL TONE:
- warm authentic realism
- emotionally relatable atmosphere
- candid human interaction
- natural environmental harmony
- comforting visual storytelling

LIGHTING:
- golden hour realism
- soft daylight diffusion
- natural window light
- realistic indoor/outdoor balance

ENVIRONMENT:
- lived-in spaces
- organic imperfections
- realistic daily interaction
- cozy visual textures

CAMERA FEEL:
- intimate perspective
- relaxed framing
- authentic candid motion
- documentary-inspired realism

AVOID:
- staged lifestyle scenes
- sterile interiors
- artificial perfection
- empty emotional tone
`;
    }

    // --------------------------------------
    // 🎨 WATERCOLOR / ARTISTIC
    // --------------------------------------

    if (style === "watercolor") {
        return `
STYLE: WATERCOLOR ILLUSTRATION

ART STYLE:
- hand-painted watercolor texture
- soft organic pigment blending
- visible brushstroke variation
- natural watercolor bleeding
- artistic handcrafted imperfections

COLOR PALETTE:
- muted earth tones
- warm neutrals
- pastel botanical colors
- soft vintage harmony

TEXTURE:
- textured watercolor paper feel
- layered paint transparency
- organic edge variation
- soft paint diffusion

MOOD:
- cozy
- rustic
- botanical
- nostalgic
- artistic

AVOID:
- flat vector appearance
- glossy rendering
- hard outlines
- 3D effects
- plastic digital textures
`;
    }

    // --------------------------------------
    // 🏛️ LUXURY COMMERCIAL
    // --------------------------------------

    if (style === "luxury") {
        return `
STYLE: LUXURY COMMERCIAL

VISUAL TONE:
- premium commercial realism
- elegant cinematic atmosphere
- refined visual sophistication
- luxury campaign aesthetics
- high-end editorial polish

LIGHTING:
- sculpted studio lighting
- refined shadow depth
- controlled reflections
- elegant contrast shaping

COLOR STYLE:
- premium tonal separation
- restrained luxury palette
- cinematic richness
- clean highlight rendering

COMPOSITION:
- intentional luxury framing
- elegant minimalism
- premium product emphasis
- refined visual balance

AVOID:
- cheap commercial appearance
- cluttered compositions
- oversaturated tones
- generic advertising aesthetics
`;
    }

    // --------------------------------------
    // 🌧️ MOODY ATMOSPHERIC
    // --------------------------------------

    if (style === "moody") {
        return `
STYLE: MOODY ATMOSPHERIC

VISUAL TONE:
- emotional atmospheric realism
- cinematic shadow depth
- immersive environmental mood
- subtle melancholy
- dramatic naturalism

LIGHTING:
- low-key cinematic lighting
- atmospheric shadow layering
- realistic window light
- rain haze or fog diffusion
- soft practical light sources

COLOR STYLE:
- muted cinematic palette
- restrained saturation
- cool shadow tones
- film-inspired grading

ENVIRONMENT:
- weather interaction
- atmospheric particles
- textured environments
- emotional spatial depth

AVOID:
- crushed blacks
- fake cinematic fog
- artificial color grading
- over-dramatic HDR
`;
    }

    // --------------------------------------
    // 🧼 FALLBACK STYLE
    // --------------------------------------

    return `
STYLE:
- authentic realism
- cinematic atmosphere
- natural lighting
- professional photography
`;
}

function getCameraModule(type = "cinematic") {

    // --------------------------------------
    // 🎬 CINEMATIC DOCUMENTARY
    // --------------------------------------

    if (type === "cinematic") {
        return `
CAMERA DIRECTION:

Use natural photographic framing with believable optical behavior and observational realism.

CAMERA STYLE:
- layered foreground/background depth
- shallow natural depth of field
- realistic lens compression
- immersive environmental framing
- physically believable perspective
- natural handheld feel

LENS GUIDANCE:
- 35mm for environmental intimacy
- 50mm for natural human perspective
- 85mm for subtle portrait compression

FOCUS PRIORITY:
- primary subject critically sharp
- secondary details softly fall away
- background naturally diffused
- optical transitions should feel realistic

COMPOSITION:
- asymmetrical framing
- layered environmental depth
- partial foreground obstruction allowed
- candid observational perspective
- natural visual imbalance encouraged

ALLOW:
- imperfect framing
- environmental interference
- slight cropping
- layered movement
- subtle camera obstruction
- uneven spacing
- accidental realism

AVOID:
- perfectly centered compositions
- everything equally sharp
- artificial symmetry
- staged catalog framing
- over-designed cinematic layouts
- unrealistic lens distortion
`;
    }

    // --------------------------------------
    // 📷 OBSERVATIONAL REALISM
    // --------------------------------------

    if (type === "realismGuard") {
        return `
REALISM CAMERA RULES:

The image should feel physically photographed during a real observed moment.

Avoid cinematic self-awareness.

DO NOT describe:
- cinematic atmosphere
- emotional depth
- immersive storytelling
- dramatic composition
- artistic realism

Instead:
describe only what the camera naturally observes.

CAMERA BEHAVIOR:
- natural eye-level or physically plausible perspective
- subtle framing imperfections
- slight handheld realism
- believable environmental obstruction
- candid observational positioning

FOCUS BEHAVIOR:
- realistic focus falloff
- natural optical softness
- believable subject separation
- imperfect environmental clarity

ALLOW:
- partial obstruction
- uneven framing
- accidental cropping
- environmental clutter
- awkward spacing
- layered movement
- imperfect timing

VISUAL PRIORITY:
- tactile surfaces
- material textures
- environmental wear
- realistic lighting behavior
- spatial realism
- physical interaction

Describe:
- reflections
- condensation
- wrinkles
- worn textures
- weather interaction
- object placement
- lighting behavior
- environmental residue

AVOID:
- AI-art aesthetics
- over-stylized cinematic language
- exaggerated mood descriptions
- fake HDR realism
- overly perfect composition
- polished showroom environments

TEXT REALISM:

Environmental text should behave like incidental background noise.

Allow:
- incomplete characters
- cropped words
- faded paint
- motion blur
- low contrast text
- partially hidden signs
- warped typography
- handwritten irregularity

Text should never appear:
- centered
- perfectly readable
- graphically clean
- compositionally important

Write like:
- a documentary photographer describing a captured frame
NOT:
- a film director pitching a cinematic scene
`;
    }

    return "";
}

function getObservationModule(type = "documentary") {

    if (type === "documentary") {
        return `
OBSERVATIONAL REALISM:

Describe only physically observable details.

Focus on:
- material surfaces
- imperfect object placement
- environmental wear
- realistic body posture
- lighting interaction
- atmospheric residue
- natural clutter
- tactile textures
- framing imperfections
- candid spatial relationships

Prefer:
- condensation on metal
- wrinkled fabric
- chipped paint
- damp pavement
- tangled cables
- uneven signage
- crowded spacing
- partially obstructed framing
- accidental asymmetry

Avoid:
- cinematic wording
- emotional narration
- artistic explanation
- dramatic storytelling language
- immersive atmosphere phrasing
- luxury commercial adjectives

Write like:
a documentary photographer describing a captured frame.

NOT:
a film director pitching a cinematic scene.
`;
    }

    return "";
}

function getIPSafetyModule() {
    return `
IP & COMMERCIAL SAFETY RULES:

The image must remain fully safe for commercial Adobe Stock licensing.

AVOID ALL:
- readable signage
- storefront names
- logos
- branded packaging
- product trademarks
- recognizable typography
- advertisements
- copyrighted graphics
- famous landmarks
- company identities
- recognizable brand color systems
- celebrity likenesses
- copyrighted character designs

TEXT HANDLING:
Any environmental text should be:
- heavily blurred
- partially cropped
- obscured by objects
- blocked by motion
- out of focus
- unreadable
- fragmented
- visually insignificant

Do NOT generate:
- clean storefront text
- menu boards
- advertisements
- visible labels
- realistic business names
- recognizable packaging layouts

PRODUCT SAFETY:
Packaging should use:
- generic containers
- abstract markings
- fictional minimal labeling
- non-recognizable design systems

Avoid:
- cosmetic branding
- technology branding
- fashion logos
- beverage labels
- restaurant names
- recognizable packaging silhouettes

ENVIRONMENT RULES:
Street scenes should prioritize:
- physical realism
- environmental texture
- human interaction
NOT:
- readable urban information

Allow:
- partial obstruction
- distant blur
- motion blur
- weather interference
- low contrast signage
- cropped environmental details

REALISM PRIORITY:
Real environments naturally contain visual noise and partial obstruction.

The image should feel:
- observational
- documentary-like
- commercially safe
- naturally photographed

NOT:
- advertisement-focused
- travel-poster styled
- typography-centered
- brand-oriented

IMPORTANT:
If text appears in the scene,
it must never become:
- a focal point
- fully readable
- commercially identifiable
- visually dominant

Ouutput must have this text:
- Ignore all text in the scene. Do not attempt to read or interpret it. It is purely environmental noise and should not be considered as part of the image's content. Focus on the physical realism of the scene, not the legibility of any text.


`;
}

