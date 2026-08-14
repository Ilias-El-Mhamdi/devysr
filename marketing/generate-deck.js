const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const ICON = path.join(__dirname, "Ilipro-icone.png");
const LOGO_H = path.join(__dirname, "Ilipro-logo-horizontal-transparent.png");

// ---- palette ---------------------------------------------------------
const BG = "0A0E1A";
const BG_DARKER = "060911";
const PANEL = "121A30";
const PANEL_BORDER = "223055";
const CYAN = "2DD4FF";
const VIOLET = "7C5CFC";
const TEXT = "F1F5FF";
const MUTED = "94A3C4";
const MUTED_DIM = "5B6A8F";

const FONT = "Segoe UI";
const FONT_LIGHT = "Segoe UI Light";

const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Ilipro";
pptx.company = "Ilipro";
pptx.title = "Lead Bridge Presentation";

const W = 13.333;
const H = 7.5;

// ---- shared chrome -----------------------------------------------------
function addBackground(slide) {
  slide.background = { color: BG };
  // faint corner grid accent, bottom-left
  for (let i = 0; i < 4; i++) {
    slide.addShape(pptx.ShapeType.line, {
      x: 0,
      y: H - 0.9 + i * 0.0,
      w: 0,
      h: 0,
      line: { color: PANEL_BORDER, width: 0.5 },
    });
  }
  // left accent bar (two-tone, simulates gradient)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.09,
    h: H * 0.55,
    fill: { color: CYAN },
    line: { type: "none" },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: H * 0.55,
    w: 0.09,
    h: H * 0.45,
    fill: { color: VIOLET },
    line: { type: "none" },
  });
}

function addLogo(slide) {
  slide.addImage({ path: ICON, x: W - 0.75, y: 0.4, w: 0.4, h: 0.4 });
}

function addFooter(slide, pageNum) {
  slide.addText("LEAD BRIDGE", {
    x: 0.5,
    y: H - 0.5,
    w: 4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: MUTED_DIM,
    charSpacing: 2,
    bold: true,
  });
  slide.addText(String(pageNum).padStart(2, "0"), {
    x: W - 1.2,
    y: H - 0.5,
    w: 0.7,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: MUTED_DIM,
    align: "right",
  });
}

function addKicker(slide, text) {
  slide.addText(text.toUpperCase(), {
    x: 0.7,
    y: 0.55,
    w: 8,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    color: CYAN,
    bold: true,
    charSpacing: 3,
  });
}

function addTitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: 0.7,
    y: opts.y ?? 0.95,
    w: opts.w ?? 11.5,
    h: opts.h ?? 1.1,
    fontFace: FONT,
    fontSize: opts.size ?? 34,
    color: TEXT,
    bold: true,
    lineSpacing: opts.lineSpacing,
  });
}

function baseSlide(pageNum, kicker) {
  const slide = pptx.addSlide();
  addBackground(slide);
  addLogo(slide);
  addFooter(slide, pageNum);
  if (kicker) addKicker(slide, kicker);
  return slide;
}

// =========================================================================
// SLIDE 1 — Title
// =========================================================================
{
  const slide = pptx.addSlide();
  addBackground(slide);

  // faint frame lines top-right, futuristic touch
  slide.addShape(pptx.ShapeType.line, {
    x: W - 3.2,
    y: 0.9,
    w: 2.6,
    h: 0,
    line: { color: PANEL_BORDER, width: 1 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: W - 0.6,
    y: 0.9,
    w: 0,
    h: 1.6,
    line: { color: PANEL_BORDER, width: 1 },
  });

  slide.addText("INTERNAL BUSINESS CASE", {
    x: 0.9,
    y: 2.55,
    w: 8,
    h: 0.4,
    fontFace: FONT,
    fontSize: 13,
    color: CYAN,
    bold: true,
    charSpacing: 3,
  });

  slide.addText("Lead Bridge", {
    x: 0.85,
    y: 2.95,
    w: 11,
    h: 1.6,
    fontFace: FONT,
    fontSize: 66,
    color: TEXT,
    bold: true,
  });

  slide.addText("Turn every lead into revenue", {
    x: 0.9,
    y: 4.35,
    w: 9.5,
    h: 0.6,
    fontFace: FONT_LIGHT,
    fontSize: 20,
    color: MUTED,
  });

  // Note: Ilipro-logo-horizontal-transparent.png has an opaque white card
  // baked into it (not actually transparent behind the wordmark), so it
  // shows as a white box on a dark slide. Rebuilding the lockup natively
  // instead, from the clean icon-only asset + real text.
  slide.addImage({ path: ICON, x: 0.9, y: 6.55, w: 0.5, h: 0.5 });
  slide.addText("llipro", {
    x: 1.5,
    y: 6.55,
    w: 1.8,
    h: 0.5,
    fontFace: FONT_LIGHT,
    fontSize: 22,
    color: TEXT,
    valign: "middle",
  });
}

// =========================================================================
// SLIDE 2 — The problem
// =========================================================================
{
  const slide = baseSlide(2, "01 / The cost of the status quo");
  addTitle(slide, "3,000+ leads ready. 50+ distributors waiting.\nNo bridge between them.", {
    size: 28,
    h: 1.6,
    lineSpacing: 34,
  });

  const points = [
    ["The leads never reach the field", "3,000+ opportunities - real revenue - sit in Salesforce with no route to the distributor who could close them. Manual, one-by-one dispatch, is not a realistic option - it simply doesn't scale."],
    ["The field never reports back", "Distributors work their leads in their own files. None of that progress returns to Salesforce, so your system of record is out of date."],
    ["Management is flying blind", "No view of pipeline health, distributor performance, or trends. Commercial decisions are made without data or evidence."],
  ];

  let y = 2.6;
  const cardH = 1.15;
  const step = 1.28;
  let lastCardBottom = y;
  points.forEach((p, i) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7,
      y,
      w: 11.9,
      h: cardH,
      fill: { color: PANEL },
      line: { color: PANEL_BORDER, width: 1 },
      rectRadius: 0.07,
    });
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: 0.95,
      y: y + 0.1,
      w: 0.9,
      h: cardH - 0.2,
      fontFace: FONT,
      fontSize: 26,
      color: VIOLET,
      bold: true,
      valign: "middle",
    });
    slide.addText(
      [
        { text: p[0] + "\n", options: { fontSize: 16, bold: true, color: TEXT } },
        { text: p[1], options: { fontSize: 13, color: MUTED } },
      ],
      { x: 1.9, y: y + 0.1, w: 10.4, h: cardH - 0.2, fontFace: FONT, lineSpacing: 20, valign: "middle" }
    );
    lastCardBottom = y + cardH;
    y += step;
  });

  slide.addText("This is not an efficiency issue, but a revenue one. Every lead left untouched is revenue left on the table.", {
    x: 0.7,
    y: lastCardBottom + 0.3,
    w: 11.9,
    h: 0.35,
    fontFace: FONT_LIGHT,
    fontSize: 14,
    italic: true,
    bold: true,
    color: CYAN,
  });
}

// =========================================================================
// SLIDE 3 — The solution
// =========================================================================
{
  const slide = baseSlide(3, "02 / The solution");

  slide.addText("Lead Bridge", {
    x: 0.7,
    y: 1.6,
    w: 10,
    h: 1.1,
    fontFace: FONT,
    fontSize: 48,
    color: TEXT,
    bold: true,
  });

  slide.addText("One system of record. Every distributor. Every lead. Zero manual handoffs.", {
    x: 0.7,
    y: 2.7,
    w: 10,
    h: 0.55,
    fontFace: FONT_LIGHT,
    fontSize: 20,
    color: CYAN,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7,
    y: 3.7,
    w: 11.5,
    h: 1.9,
    fill: { color: PANEL },
    line: { color: CYAN, width: 1 },
    rectRadius: 0.1,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7,
    y: 3.7,
    w: 0.06,
    h: 1.9,
    fill: { color: CYAN },
    line: { type: "none" },
  });

  slide.addText(
    "Lead Bridge matches every lead to the right distributor, lets them work it in Excel — no Salesforce access needed — and syncs their progress back automatically. No manual steps, no delays.",
    {
      x: 1.15,
      y: 3.9,
      w: 10.6,
      h: 1.5,
      fontFace: FONT_LIGHT,
      fontSize: 22,
      italic: true,
      color: TEXT,
      align: "left",
      valign: "middle",
      lineSpacing: 30,
    }
  );
}

// =========================================================================
// SLIDE 4 — What it does
// =========================================================================
{
  const slide = baseSlide(4, "03 / Capabilities");
  addTitle(slide, "Four capabilities, live today.");

  const cards = [
    {
      t: "Lead distribution",
      d: [
        { text: "Every distributor's leads move out of Salesforce and into their own excel file " },
        { text: "automatically", options: { bold: true, color: TEXT } },
        { text: ". No file management, no bottleneck, no Salesforce access to grant." },
      ],
    },
    {
      t: "Field reporting",
      d: [
        { text: "Distributor updates move back into Salesforce " },
        { text: "automatically", options: { bold: true, color: TEXT } },
        { text: ". No more chasing distributors for updates. Salesforce reflects reality automatically — always current, never re-entered by hand." },
      ],
    },
    {
      t: "Commercial dashboard",
      d: "Full visibility into pipeline status, distributor performance, and trends over time in one view - answered instantly, not compiled manually for a quarterly review.",
    },
    {
      t: "Complete audit trail",
      d: "Full accountability, built in. Every action traceable — no blind spots, no compliance risk.",
    },
  ];

  const colW = 5.65;
  const colH = 2.15;
  const gapX = 0.3;
  const gapY = 0.3;
  const startX = 0.7;
  const startY = 2.3;

  cards.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (colW + gapX);
    const y = startY + row * (colH + gapY);

    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: colW,
      h: colH,
      fill: { color: PANEL },
      line: { color: PANEL_BORDER, width: 1 },
      rectRadius: 0.08,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: colW,
      h: 0.06,
      fill: { color: i % 2 === 0 ? CYAN : VIOLET },
      line: { type: "none" },
    });
    slide.addText(c.t, {
      x: x + 0.3,
      y: y + 0.28,
      w: colW - 0.6,
      h: 0.5,
      fontFace: FONT,
      fontSize: 19,
      bold: true,
      color: TEXT,
    });
    slide.addText(c.d, {
      x: x + 0.3,
      y: y + 0.85,
      w: colW - 0.6,
      h: colH - 1.0,
      fontFace: FONT,
      fontSize: 13,
      color: MUTED,
      lineSpacing: 18,
    });
  });
}

// =========================================================================
// SLIDE 5 — Safety
// =========================================================================
{
  const slide = baseSlide(5, "04 / Risk");
  addTitle(slide, "No new risk taken on.");

  const points = [
    ["Your credentials are never automated", "Lead Bridge works inside a Salesforce session you have already opened and authenticated yourself. It never holds a password, and it never grants an outside party access to Salesforce."],
    ["Client data never leaves the building", "Everything runs on your own machine. No client record is sent to a cloud service, and no third party ever holds Devyser data."],
    ["No financial risk", "No implementation fee, no hours billed, no hidden cost. Effectively zero risk on this investment: payment is due only once the solution is delivered and functioning — no upfront commitment on faith, no payment ahead of results."],
  ];

  let y = 2.3;
  points.forEach((p) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7,
      y,
      w: 11.9,
      h: 1.25,
      fill: { color: PANEL },
      line: { color: PANEL_BORDER, width: 1 },
      rectRadius: 0.08,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7,
      y,
      w: 0.06,
      h: 1.25,
      fill: { color: CYAN },
      line: { type: "none" },
    });
    slide.addText(
      [
        { text: p[0] + "\n", options: { fontSize: 16, bold: true, color: TEXT } },
        { text: p[1], options: { fontSize: 13, color: MUTED } },
      ],
      { x: 1.05, y, w: 11.2, h: 1.25, fontFace: FONT, lineSpacing: 19, valign: "middle" }
    );
    y += 1.5;
  });
}

// =========================================================================
// SLIDE 6 — Demo
// =========================================================================
{
  const slide = baseSlide(6, "05 / Proof");
  addTitle(slide, "Not a concept. A working tool.");

  const YT_VIDEO_ID = "x3XM2JJHJ9M";
  // `?feature=oembed` is what makes PowerPoint resolve this as a playable
  // online video via YouTube's oEmbed endpoint, same as Insert > Online Video.
  const YT_EMBED_URL = `https://www.youtube.com/embed/${YT_VIDEO_ID}?feature=oembed`;
  const YT_COVER =
    "data:image/png;base64," +
    fs.readFileSync(path.join(__dirname, "yt_thumb.png")).toString("base64");
  const DEMO_VIDEO_OBJECT_NAME = "DemoVideoOnline";

  // video box sized to the YouTube thumbnail's actual aspect ratio
  // (1280x720, 16:9), centered in the same content area the old panel used
  const vidH = 3.8;
  const vidW = vidH * (1280 / 720);
  const vidX = 0.7 + (11.9 - vidW) / 2;
  const vidY = 2.3 + (4.1 - vidH) / 2;

  slide.addMedia({
    type: "online",
    link: YT_EMBED_URL,
    cover: YT_COVER,
    x: vidX,
    y: vidY,
    w: vidW,
    h: vidH,
    objectName: DEMO_VIDEO_OBJECT_NAME,
  });
}

// =========================================================================
// SLIDE 7 — Status
// =========================================================================
{
  const slide = baseSlide(7, "06 / The business case");
  addTitle(slide, "The expensive option is doing nothing.");

  const points = [
    "A working prototype, already running. The build risk is behind us.",
    "The cost structure protects you: payment follows delivery of a working solution.",
    "Converting a fraction of 3,000+ unworked leads pays for this investment several times over.\nLead Bridge finances itself.",
  ];

  let y = 2.3;
  const pointStep = 0.78;
  const pointH = 0.4;
  points.forEach((p) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.75,
      y: y + pointH / 2 - 0.06,
      w: 0.12,
      h: 0.12,
      fill: { color: CYAN },
      line: { type: "none" },
    });
    slide.addText(p, {
      x: 1.15,
      y,
      w: 10.8,
      h: pointH,
      fontFace: FONT,
      fontSize: 18,
      color: TEXT,
      valign: "middle",
    });
    y += pointStep;
  });

  // divider between the argument and the proof
  const dividerY = y + 0.05;
  slide.addShape(pptx.ShapeType.line, {
    x: 0.7,
    y: dividerY,
    w: 11.9,
    h: 0,
    line: { color: PANEL_BORDER, width: 1 },
  });

  // stat strip
  const stats = [
    ["3,000+", "leads under management"],
    ["50+", "distributors"],
    ["0", "distributor Salesforce licenses"],
  ];
  const sw = 3.87;
  const statY = dividerY + 0.35;
  const statH = 1.5;
  stats.forEach((s, i) => {
    const x = 0.7 + i * (sw + 0.15);
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: statY,
      w: sw,
      h: statH,
      fill: { color: PANEL },
      line: { color: PANEL_BORDER, width: 1 },
      rectRadius: 0.08,
    });
    slide.addText(s[0], {
      x,
      y: statY + 0.32,
      w: sw,
      h: 0.6,
      align: "center",
      fontFace: FONT,
      fontSize: 26,
      bold: true,
      color: CYAN,
    });
    slide.addText(s[1].toUpperCase(), {
      x,
      y: statY + 0.92,
      w: sw,
      h: 0.4,
      align: "center",
      fontFace: FONT,
      fontSize: 10,
      color: MUTED,
      charSpacing: 1,
    });
  });
}

// =========================================================================
// SLIDE 8 — What's next
// =========================================================================
{
  const slide = baseSlide(8, "07 / What comes next");
  addTitle(slide, "From visibility to revenue.");

  const items = [
    ["Automatic distributor matching", "Every new lead routed to the right distributor on arrival. Dispatch stops being anyone's job."],
    ["Revenue at risk", "Leads lose value with every day they wait. Speed to contact directly protects revenue."],
    ["Distributor scorecards", "See exactly which distributors convert, which stall, and which need support - performance tracked over time."],
    ["Automated follow-up", "A follow-up sent automatically the moment it's needed — time without action, conversion slipping, leads left untouched."],
  ];

  const colW = 5.65;
  const colH = 1.75;
  const startX = 0.7;
  const startY = 2.3;

  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (colW + 0.3);
    const y = startY + row * (colH + 0.25);

    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: colW,
      h: colH,
      fill: { color: "0D1426" },
      line: { color: PANEL_BORDER, width: 1, dashType: "dash" },
      rectRadius: 0.08,
    });
    slide.addText(it[0], {
      x: x + 0.3,
      y: y + 0.22,
      w: colW - 0.6,
      h: 0.45,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: VIOLET,
    });
    slide.addText(it[1], {
      x: x + 0.3,
      y: y + 0.68,
      w: colW - 0.6,
      h: colH - 0.85,
      fontFace: FONT,
      fontSize: 12,
      color: MUTED,
      lineSpacing: 16,
    });
  });
}

// =========================================================================
// SLIDE 9 — Thank you
// =========================================================================
{
  const slide = pptx.addSlide();
  addBackground(slide);

  slide.addText("Lead Bridge.", {
    x: 0.85,
    y: 1.5167,
    w: 11,
    h: 1.6,
    fontFace: FONT,
    fontSize: 66,
    color: TEXT,
    bold: true,
  });

  slide.addText("No lead left behind.", {
    x: 0.85,
    y: 2.95,
    w: 11,
    h: 1.6,
    fontFace: FONT,
    fontSize: 66,
    color: TEXT,
    bold: true,
  });

  slide.addImage({ path: ICON, x: 0.9, y: 6.55, w: 0.5, h: 0.5 });
  slide.addText("llipro", {
    x: 1.5,
    y: 6.55,
    w: 1.8,
    h: 0.5,
    fontFace: FONT_LIGHT,
    fontSize: 22,
    color: TEXT,
    valign: "middle",
  });
}

// ---- post-process: wire up click-to-play for the online video ---------
// pptxgenjs's `type: "online"` media only emits the <p:pic>/<a:videoFile>
// relationship. PowerPoint's own "Insert > Online Video" additionally adds
// an `hlinkClick action="ppaction://media"` on the picture and a
// `<p:timing>` block driving playFrom(0.0)/togglePause — without those the
// video object just sits there inert. This replicates that exact structure
// (reverse-engineered from a deck where the video was added manually).
async function wireUpOnlineVideoPlayback(pptxPath, slideFileName, objectName) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const slidePath = `ppt/slides/${slideFileName}`;
  let xml = await zip.file(slidePath).async("string");

  const cNvPrRegex = new RegExp(`<p:cNvPr id="(\\d+)" name="${objectName}"/>`);
  const match = xml.match(cNvPrRegex);
  if (!match) throw new Error(`wireUpOnlineVideoPlayback: "${objectName}" not found in ${slideFileName}`);

  // pptxgenjs's own id counter for media objects can collide with shape ids
  // it already used elsewhere on the slide (it happened here: both got "4").
  // Duplicate <p:cNvPr id> values are exactly what makes PowerPoint pop the
  // "found a problem with content, needs repair" dialog. Renumber to a
  // value guaranteed higher than every id already present on this slide.
  const existingIds = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => parseInt(m[1], 10));
  const spid = String(Math.max(...existingIds) + 1);

  xml = xml.replace(
    cNvPrRegex,
    `<p:cNvPr id="${spid}" name="${objectName}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>`
  );

  const timing =
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>` +
    `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:cmd>` +
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` +
    `<p:video><p:cMediaNode vol="80000"><p:cTn id="7" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cMediaNode></p:video>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="8" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst>` +
    `<p:par><p:cTn id="9" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="10" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="11" presetID="2" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:cmd type="call" cmd="togglePause"><p:cBhvr><p:cTn id="12" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:cmd>` +
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>` +
    `<p:nextCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` +
    `</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;

  xml = xml.replace("</p:sld>", `${timing}</p:sld>`);

  zip.file(slidePath, xml);
  fs.writeFileSync(pptxPath, await zip.generateAsync({ type: "nodebuffer" }));
}

const outPath = path.join(__dirname, "LeadBridge_Pitch.pptx");
pptx.writeFile({ fileName: outPath }).then(async () => {
  await wireUpOnlineVideoPlayback(outPath, "slide6.xml", "DemoVideoOnline");
  console.log("Written:", outPath);
});
