/**
 * Renders a Markdown string into a PNG Buffer suitable for attaching
 * to Discord messages as a file upload.
 *
 * Supports:
 *  - Nested inline styles: **bold *bold-italic* bold** etc.
 *  - Strikethrough (~~text~~)
 *  - Underline (__text__)
 *  - Nested blockquotes (>>> level 2, >>> level 3)
 *  - Inline images: ![alt](url) — fetched and rendered inline
 *  - Block images: standalone ![…](…) paragraph
 *  - Nested lists (ordered and unordered, unlimited depth)
 *  - Task lists  - [x] done  - [ ] todo
 *  - Tables with per-column alignment
 *  - Fenced code blocks with language label
 *  - Inline code spans
 *  - Block-level HTML comments stripped
 *  - Horizontal rules
 *  - Hard line breaks (two trailing spaces or \)
 */

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { marked, type Token, type Tokens } from "marked";

// ─── Layout ───────────────────────────────────────────────────────────────────

const IMG_WIDTH = 860;
const PAD = 40;
const INNER_W = IMG_WIDTH - PAD * 2;
const BASE_SZ = 14;
const BASE_LH = BASE_SZ * 1.7; // px between baselines for body text
const MAX_H = 10_000;
const IMG_MAX_W = INNER_W;
const IMG_MAX_H = 320;

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: "#1e1f22",
  surface: "#2b2d31",
  surface2: "#232428",
  border: "#1a1b1e",
  text: "#dbdee1",
  muted: "#949ba4",
  heading: "#f2f3f5",
  code_bg: "#2b2d31",
  code_text: "#e3e5e8",
  inline_code_bg: "#2e3035",
  rule: "#3a3c40",
  quote_bar: "#5865f2",
  quote_text: "#b5bac1",
  bullet: "#80848e",
  link: "#7289da",
  del: "#949ba4",
  task_done: "#23a55a",
  task_todo: "#80848e",
  table_header_bg: "#232428",
  table_alt_bg: "#26272b",
} as const;

const SAN = "sans-serif";
const MON = "monospace";

// ─── Inline style flags ───────────────────────────────────────────────────────

interface Style {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  underline: boolean;
  size: number;
  color: string;
  mono: boolean;
}

const BASE_STYLE: Style = {
  bold: false,
  italic: false,
  strike: false,
  underline: false,
  size: BASE_SZ,
  color: C.text,
  mono: false,
};

// ─── Inline segments ──────────────────────────────────────────────────────────

type TextSeg = { kind: "text"; text: string } & Style;
type CodeSeg = { kind: "code"; text: string };
type LinkSeg = { kind: "link"; text: string; segs: InlineSeg[] };
type ImageSeg = { kind: "image"; src: string; alt: string };
type BrSeg = { kind: "br" };

type InlineSeg = TextSeg | CodeSeg | LinkSeg | ImageSeg | BrSeg;

// ─── Inline parser ────────────────────────────────────────────────────────────

function parseInlineTokens(tokens: Token[] | undefined, style: Style): InlineSeg[] {
  if (!tokens || tokens.length === 0) return [];
  const out: InlineSeg[] = [];

  for (const tok of tokens) {
    switch (tok.type) {
      case "text": {
        // marked puts inline children in .tokens when present
        const t = tok as Tokens.Text;
        if (t.tokens?.length) {
          out.push(...parseInlineTokens(t.tokens as Token[], style));
        } else {
          out.push({ kind: "text", text: t.text ?? "", ...style });
        }
        break;
      }
      case "strong": {
        const inner = { ...style, bold: true };
        // strong can also be italic if nested: ***text***
        out.push(...parseInlineTokens((tok as Tokens.Strong).tokens as Token[], inner));
        break;
      }
      case "em": {
        const inner = { ...style, italic: true };
        out.push(...parseInlineTokens((tok as Tokens.Em).tokens as Token[], inner));
        break;
      }
      case "del": {
        const inner = { ...style, strike: true, color: C.del };
        out.push(...parseInlineTokens((tok as Tokens.Del).tokens as Token[], inner));
        break;
      }
      // marked doesn't have a native underline token but some extensions do
      case "underline" as any: {
        const inner = { ...style, underline: true };
        out.push(...parseInlineTokens((tok as any).tokens as Token[], inner));
        break;
      }
      case "codespan":
        out.push({ kind: "code", text: tok.text });
        break;
      case "link": {
        const lt = tok as Tokens.Link;
        out.push({
          kind: "link",
          text: lt.text,
          segs: parseInlineTokens(lt.tokens as Token[], { ...style, color: C.link }),
        });
        break;
      }
      case "image": {
        const it = tok as Tokens.Image;
        out.push({ kind: "image", src: it.href, alt: it.text });
        break;
      }
      case "br":
        out.push({ kind: "br" });
        break;
      case "escape":
        out.push({ kind: "text", text: tok.text, ...style });
        break;
      case "html":
        // Strip HTML comments and tags from inline flow
        break;
      default:
        if ("raw" in tok && tok.raw) {
          out.push({ kind: "text", text: (tok as any).raw as string, ...style });
        }
    }
  }
  return out;
}

// ─── Font helper ──────────────────────────────────────────────────────────────

function applyFont(
  ctx: SKRSContext2D,
  style: Pick<Style, "size" | "bold" | "italic" | "mono">
): void {
  const fam = style.mono ? MON : SAN;
  const w = style.bold ? "bold " : "";
  const s = style.italic ? "italic " : "";
  ctx.font = `${s}${w}${style.size}px ${fam}`;
}

// ─── Rounded rect ─────────────────────────────────────────────────────────────

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Render state ─────────────────────────────────────────────────────────────

interface S {
  ctx: SKRSContext2D;
  y: number;
  /** Resolved external images (src → ImageBitmap-like) */
  images: Map<string, Awaited<ReturnType<typeof loadImage>> | null>;
}

function makeS(ctx: SKRSContext2D, images: S["images"]): S {
  return { ctx, y: PAD, images };
}

// ─── Inline word-wrap renderer ────────────────────────────────────────────────

/**
 * Renders a flat list of InlineSegs with full word-wrap.
 * Handles text, code spans, links (with nested bold/italic), images, and
 * hard line breaks. Advances s.y to just below the last line rendered.
 *
 * @param s        render state
 * @param segs     flat segment list
 * @param lh       line height in px
 * @param xLeft    left edge of text area (absolute canvas x)
 * @param maxW     maximum width of text area in px
 */
function renderInline(s: S, segs: InlineSeg[], lh: number, xLeft: number, maxW: number): void {
  const { ctx } = s;
  let x = xLeft;
  let lineY = s.y; // baseline of the current line

  /** Advance to the next line */
  const nl = () => {
    lineY += lh;
    x = xLeft;
  };

  for (const seg of segs) {
    // ── Hard line break ──────────────────────────────────────────────────────
    if (seg.kind === "br") {
      nl();
      continue;
    }

    // ── Inline image ─────────────────────────────────────────────────────────
    if (seg.kind === "image") {
      const img = s.images.get(seg.src);
      if (img) {
        // Scale to fit available width on the current line, or a full new line
        const ratio = img.width / img.height;
        const imgW = Math.min(img.width, maxW);
        const imgH = imgW / ratio;

        // If the image won't fit on the current line, wrap first
        if (x + imgW > xLeft + maxW && x > xLeft) nl();

        // Clip image to IMG_MAX_H
        const drawH = Math.min(imgH, IMG_MAX_H);
        const drawW = drawH * ratio;

        ctx.drawImage(img, x, lineY - BASE_SZ, drawW, drawH);
        x += drawW + 4;
      }
      continue;
    }

    // ── Code span ────────────────────────────────────────────────────────────
    if (seg.kind === "code") {
      const codeStyle: Style = { ...BASE_STYLE, mono: true, size: BASE_SZ - 1 };
      applyFont(ctx, codeStyle);

      // Split on whitespace so long code spans can wrap
      const words = seg.text.split(" ");
      for (let wi = 0; wi < words.length; wi++) {
        const word = words[wi];
        const isLast = wi === words.length - 1;
        const tw = ctx.measureText(word).width;
        const pill = tw + 8; // horizontal padding inside pill

        if (x + pill > xLeft + maxW && x > xLeft) nl();

        ctx.fillStyle = C.inline_code_bg;
        ctx.fillRect(x, lineY - codeStyle.size + 1, pill, codeStyle.size + 5);
        ctx.fillStyle = C.code_text;
        ctx.fillText(word, x + 4, lineY + 1);
        x += pill + (isLast ? 0 : ctx.measureText(" ").width);
      }
      continue;
    }

    // ── Link (may contain nested styled segs) ─────────────────────────────────
    if (seg.kind === "link") {
      // Flatten link children into text segments with link color already set
      renderInline(s, seg.segs, lh, x, maxW - (x - xLeft));
      // After renderInline returns s.y has advanced; we need to sync our cursor.
      // renderInline only advances s.y by complete lines, but x is local here.
      // We restart on whatever the last x position was — not perfectly accurate
      // for inline links but avoids overlap. In practice links are short.
      lineY = s.y - lh; // s.y already points past the last line
      x = xLeft; // conservative: resume at left after a link block
      continue;
    }

    // ── Text with nested style (bold, italic, strike, underline) ──────────────
    {
      applyFont(ctx, seg);

      // Split on spaces to word-wrap; handle embedded hard newlines from \n
      const parts = seg.text.split("\n");
      for (let pi = 0; pi < parts.length; pi++) {
        if (pi > 0) nl();

        const words = parts[pi].split(" ");
        for (let wi = 0; wi < words.length; wi++) {
          const word = words[wi];
          const isLastW = wi === words.length - 1;

          // Re-apply font before measuring (may have changed for inline code)
          applyFont(ctx, seg);

          const sp = ctx.measureText(" ").width;
          const tw = ctx.measureText(word).width;

          if (word === "") {
            // Preserve intentional spaces between words
            if (x > xLeft) x += sp;
            continue;
          }

          if (x + tw > xLeft + maxW && x > xLeft) nl();

          ctx.fillStyle = seg.color;
          ctx.fillText(word, x, lineY);

          // Strikethrough
          if (seg.strike) {
            const mid = lineY - seg.size * 0.35;
            ctx.fillStyle = seg.color;
            ctx.fillRect(x, mid, tw, 1);
          }

          // Underline
          if (seg.underline) {
            ctx.fillStyle = seg.color;
            ctx.fillRect(x, lineY + 2, tw, 1);
          }

          x += tw + (isLastW ? 0 : sp);
        }
      }
    }
  }

  // Advance state to below the last rendered line
  s.y = lineY + lh;
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function drawHeading(s: S, tok: Tokens.Heading): void {
  const szMap: Record<number, number> = { 1: 30, 2: 24, 3: 20, 4: 17, 5: 15, 6: 14 };
  const sz = szMap[tok.depth] ?? 14;
  const lh = sz * 1.5;

  s.y += tok.depth <= 2 ? 20 : 12;

  // Heading tokens may contain inline children (bold, link, etc.)
  const segs = parseInlineTokens(tok.tokens as Token[], {
    ...BASE_STYLE,
    bold: true,
    size: sz,
    color: C.heading,
  });

  renderInline(s, segs, lh, PAD, INNER_W);

  if (tok.depth <= 2) {
    s.ctx.fillStyle = C.rule;
    s.ctx.fillRect(PAD, s.y - lh * 0.3, INNER_W, 1);
    s.y += 6;
  }

  s.y += 4;
}

function drawParagraph(s: S, tok: Tokens.Paragraph): void {
  // A paragraph consisting of a single image token becomes a block image
  const toks = tok.tokens as Token[] | undefined;
  if (toks?.length === 1 && toks[0].type === "image") {
    drawBlockImage(s, toks[0] as Tokens.Image);
    return;
  }

  s.y += 2;
  const segs = parseInlineTokens(toks, BASE_STYLE);
  renderInline(s, segs, BASE_LH, PAD, INNER_W);
  s.y += 4;
}

function drawBlockImage(s: S, tok: Tokens.Image): void {
  const img = s.images.get(tok.href);
  if (!img) {
    // Fallback: render alt text in muted italic
    s.y += 4;
    const segs: InlineSeg[] = [
      {
        kind: "text",
        text: `[image: ${tok.text || tok.href}]`,
        ...BASE_STYLE,
        color: C.muted,
        italic: true,
      },
    ];
    renderInline(s, segs, BASE_LH, PAD, INNER_W);
    s.y += 4;
    return;
  }

  const ratio = img.width / img.height;
  const drawW = Math.min(img.width, IMG_MAX_W);
  const drawH = Math.min(drawW / ratio, IMG_MAX_H);
  const finalW = drawH * ratio;

  s.y += 8;
  s.ctx.save();
  roundRect(s.ctx, PAD, s.y, finalW, drawH, 6);
  s.ctx.clip();
  s.ctx.drawImage(img, PAD, s.y, finalW, drawH);
  s.ctx.restore();

  if (tok.text) {
    s.y += drawH + 4;
    applyFont(s.ctx, { ...BASE_STYLE, italic: true, size: 12 });
    s.ctx.fillStyle = C.muted;
    s.ctx.fillText(tok.text, PAD, s.y);
    s.y += 16;
  } else {
    s.y += drawH + 12;
  }
}

function drawList(s: S, tok: Tokens.List, depth = 0): void {
  const indent = depth * 22;

  for (let i = 0; i < tok.items.length; i++) {
    const item = tok.items[i];
    const bulletX = PAD + indent;
    const textX = bulletX + 22;
    const maxW = INNER_W - indent - 22;

    // ── Task list item ───────────────────────────────────────────────────────
    if (tok.items[i].task) {
      const checked = tok.items[i].checked ?? false;
      // Draw checkbox
      s.ctx.strokeStyle = checked ? C.task_done : C.task_todo;
      s.ctx.lineWidth = 1.5;
      s.ctx.strokeRect(bulletX, s.y - BASE_SZ + 2, BASE_SZ, BASE_SZ);

      if (checked) {
        s.ctx.fillStyle = C.task_done;
        // Draw checkmark
        s.ctx.beginPath();
        s.ctx.moveTo(bulletX + 3, s.y - BASE_SZ + 8);
        s.ctx.lineTo(bulletX + 6, s.y - BASE_SZ + 11);
        s.ctx.lineTo(bulletX + BASE_SZ - 3, s.y - BASE_SZ + 5);
        s.ctx.lineWidth = 1.5;
        s.ctx.strokeStyle = C.task_done;
        s.ctx.stroke();
      }
    } else {
      // ── Bullet / number ──────────────────────────────────────────────────
      applyFont(s.ctx, BASE_STYLE);
      s.ctx.fillStyle = C.bullet;
      const label = tok.ordered ? `${i + 1}.` : depth === 0 ? "•" : depth === 1 ? "◦" : "▪";
      s.ctx.fillText(label, bulletX, s.y);
    }

    // ── Item text ─────────────────────────────────────────────────────────
    const savedY = s.y;
    const segs = parseInlineTokens(item.tokens as Token[], BASE_STYLE);
    renderInline(s, segs, BASE_LH, textX, maxW);

    // If item had no text tokens, advance by one line
    if (s.y === savedY) s.y += BASE_LH;

    // ── Nested tokens (sub-lists, paragraphs, blockquotes) ───────────────
    for (const child of item.tokens ?? []) {
      if (child.type === "list") {
        drawList(s, child as Tokens.List, depth + 1);
      } else if (child.type === "blockquote") {
        drawBlockquote(s, child as Tokens.Blockquote, textX - PAD);
      }
    }

    s.y += 2;
  }

  if (depth === 0) s.y += 4;
}

function drawCode(s: S, tok: Tokens.Code): void {
  const { ctx } = s;
  const sz = 13;
  const lh = sz * 1.6;
  const ipad = 14; // inner padding
  const lines = (tok.text ?? "").split("\n");
  const hasLang = !!tok.lang;
  const boxH = lines.length * lh + ipad * 2 + (hasLang ? 20 : 0);

  s.y += 8;

  // Background
  ctx.fillStyle = C.code_bg;
  roundRect(ctx, PAD, s.y, INNER_W, boxH, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, s.y, INNER_W, boxH, 6);
  ctx.stroke();

  s.y += ipad;

  // Language label + separator
  if (hasLang) {
    applyFont(ctx, { ...BASE_STYLE, mono: true, size: 11 });
    ctx.fillStyle = C.muted;
    ctx.fillText(tok.lang!, PAD + ipad, s.y);
    s.y += 18;
    ctx.fillStyle = C.border;
    ctx.fillRect(PAD, s.y - 4, INNER_W, 1);
    s.y += 4;
  }

  // Clip code text to box interior so long lines don't overflow visually
  applyFont(ctx, { ...BASE_STYLE, mono: true, size: sz });
  ctx.fillStyle = C.code_text;
  ctx.save();
  ctx.rect(PAD + ipad, s.y - lh, INNER_W - ipad * 2, boxH);
  ctx.clip();
  for (const line of lines) {
    ctx.fillText(line, PAD + ipad, s.y);
    s.y += lh;
  }
  ctx.restore();

  s.y += ipad + 8;
}

/**
 * drawBlockquote supports any depth of nesting.
 * Each nesting level adds `QUOTE_INDENT` pixels of left offset and
 * changes the accent bar color slightly.
 */
const QUOTE_INDENT = 20;
const QUOTE_BAR_W = 3;
const QUOTE_BAR_GAP = 8;

function drawBlockquote(s: S, tok: Tokens.Blockquote, extraIndent = 0): void {
  const indent = extraIndent;
  const textX = PAD + indent + QUOTE_BAR_W + QUOTE_BAR_GAP;
  const maxW = INNER_W - indent - QUOTE_BAR_W - QUOTE_BAR_GAP;
  const startY = s.y;

  s.y += 4;

  for (const inner of tok.tokens) {
    if (inner.type === "paragraph") {
      const segs = parseInlineTokens((inner as Tokens.Paragraph).tokens as Token[], {
        ...BASE_STYLE,
        color: C.quote_text,
      });
      renderInline(s, segs, BASE_LH, textX, maxW);
    } else if (inner.type === "blockquote") {
      // Nested blockquote: recurse with increased indent
      drawBlockquote(s, inner as Tokens.Blockquote, indent + QUOTE_INDENT);
    } else if (inner.type === "code") {
      drawCode(s, inner as Tokens.Code);
    } else if (inner.type === "list") {
      drawList(s, inner as Tokens.List);
    } else if (inner.type === "space") {
      s.y += BASE_LH * 0.4;
    }
  }

  s.y += 4;

  // Accent bar — drawn after so we know the real height
  const barColor =
    extraIndent === 0 ? C.quote_bar : extraIndent === QUOTE_INDENT ? "#4e5058" : "#3a3c40";

  s.ctx.fillStyle = barColor;
  s.ctx.fillRect(PAD + indent, startY, QUOTE_BAR_W, s.y - startY);
  s.y += 4;
}

function drawHr(s: S): void {
  s.y += 10;
  s.ctx.fillStyle = C.rule;
  s.ctx.fillRect(PAD, s.y, INNER_W, 1);
  s.y += 14;
}

function drawTable(s: S, tok: Tokens.Table): void {
  const { ctx } = s;
  const cols = tok.header.length;
  if (cols === 0) return;

  const colW = INNER_W / cols;
  const rowH = BASE_SZ * 2.4;
  const ipad = 8;

  // Outer border
  const totalH = rowH * (1 + tok.rows.length);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, s.y, INNER_W, totalH, 4);
  ctx.stroke();

  // Header background
  ctx.fillStyle = C.table_header_bg;
  roundRect(ctx, PAD, s.y, INNER_W, rowH, 4);
  ctx.fill();

  // Header text
  applyFont(ctx, { ...BASE_STYLE, bold: true });
  ctx.fillStyle = C.heading;

  for (let c = 0; c < cols; c++) {
    const cell = tok.header[c];
    const cellTxt = cell?.text ?? "";
    const align = tok.align?.[c];
    const cx = PAD + c * colW;
    const tw = ctx.measureText(cellTxt).width;

    let tx = cx + ipad;
    if (align === "center") tx = cx + colW / 2 - tw / 2;
    if (align === "right") tx = cx + colW - tw - ipad;

    ctx.fillText(cellTxt, tx, s.y + rowH * 0.65);

    // Column divider
    if (c > 0) {
      ctx.fillStyle = C.border;
      ctx.fillRect(cx, s.y, 1, rowH);
      ctx.fillStyle = C.heading;
    }
  }
  s.y += rowH;

  // Header / body separator
  ctx.fillStyle = C.rule;
  ctx.fillRect(PAD, s.y, INNER_W, 1);

  // Body rows
  for (let r = 0; r < tok.rows.length; r++) {
    ctx.fillStyle = r % 2 === 0 ? C.surface2 : C.table_alt_bg;
    ctx.fillRect(PAD, s.y, INNER_W, rowH);

    applyFont(ctx, BASE_STYLE);
    ctx.fillStyle = C.text;

    for (let c = 0; c < cols; c++) {
      const cell = tok.rows[r][c];
      const text = cell?.text ?? "";
      const align = tok.align?.[c];
      const cx = PAD + c * colW;
      const tw = ctx.measureText(text).width;

      let tx = cx + ipad;
      if (align === "center") tx = cx + colW / 2 - tw / 2;
      if (align === "right") tx = cx + colW - tw - ipad;

      ctx.fillText(text, tx, s.y + rowH * 0.65);

      if (c > 0) {
        ctx.fillStyle = C.border;
        ctx.fillRect(cx, s.y, 1, rowH);
        ctx.fillStyle = C.text;
      }
    }
    s.y += rowH;
  }

  s.y += 10;
}

// ─── Token dispatch ───────────────────────────────────────────────────────────

function renderToken(s: S, tok: Token): void {
  switch (tok.type) {
    case "heading":
      drawHeading(s, tok as Tokens.Heading);
      break;
    case "paragraph":
      drawParagraph(s, tok as Tokens.Paragraph);
      break;
    case "list":
      drawList(s, tok as Tokens.List);
      break;
    case "code":
      drawCode(s, tok as Tokens.Code);
      break;
    case "blockquote":
      drawBlockquote(s, tok as Tokens.Blockquote);
      break;
    case "hr":
      drawHr(s);
      break;
    case "table":
      drawTable(s, tok as Tokens.Table);
      break;
    case "image":
      drawBlockImage(s, tok as Tokens.Image);
      break;
    case "space":
      s.y += BASE_LH * 0.5;
      break;
    case "html":
      /* strip HTML/comments */ break;
    default:
      break;
  }
}

function renderAll(s: S, tokens: Token[]): void {
  for (const tok of tokens) renderToken(s, tok);
}

// ─── Image prefetch ───────────────────────────────────────────────────────────

/**
 * Walk the token tree and collect every image URL so we can fetch them
 * all in parallel before the two-pass render.
 */
function collectImageUrls(tokens: Token[]): Set<string> {
  const urls = new Set<string>();

  const visit = (tok: Token) => {
    if (tok.type === "image") {
      urls.add((tok as Tokens.Image).href);
      return;
    }
    if (tok.type === "paragraph") {
      for (const child of (tok as Tokens.Paragraph).tokens ?? []) visit(child as Token);
      return;
    }
    // Also catch inline images inside paragraphs / headings
    if ("tokens" in tok && Array.isArray((tok as any).tokens)) {
      for (const child of (tok as any).tokens) visit(child as Token);
    }
    if (tok.type === "list") {
      for (const item of (tok as Tokens.List).items) {
        for (const child of item.tokens ?? []) visit(child as Token);
      }
    }
    if (tok.type === "blockquote") {
      for (const child of (tok as Tokens.Blockquote).tokens) visit(child as Token);
    }
  };

  for (const tok of tokens) visit(tok);
  return urls;
}

async function prefetchImages(
  urls: Set<string>
): Promise<Map<string, Awaited<ReturnType<typeof loadImage>> | null>> {
  const map = new Map<string, Awaited<ReturnType<typeof loadImage>> | null>();

  await Promise.all(
    [...urls].map(async (url) => {
      // Only allow http(s) URLs to avoid path-traversal via file:// etc.
      if (!/^https?:\/\//i.test(url)) {
        map.set(url, null);
        return;
      }
      try {
        const img = await loadImage(url);
        map.set(url, img);
      } catch {
        map.set(url, null);
      }
    })
  );

  return map;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a Markdown string into a PNG Buffer.
 *
 * Supported syntax:
 *   Headings, paragraphs, bold, italic, bold-italic, strikethrough, underline,
 *   inline code, fenced code blocks with language label, blockquotes (nested),
 *   ordered/unordered/task lists (nested), tables with alignment, horizontal
 *   rules, inline images (fetched from https), block images, hard line breaks,
 *   links (rendered in Discord blue with nested inline styles).
 *
 * Two-pass strategy: dry-run on a scratch canvas to measure true height,
 * then render onto a canvas of exactly that height.
 */
export async function markdownToPng(markdown: string): Promise<Buffer> {
  const body = markdown.trim();

  if (!body) {
    const c = createCanvas(IMG_WIDTH, 60);
    const ctx = c.getContext("2d");
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, IMG_WIDTH, 60);
    applyFont(ctx, { ...BASE_STYLE, italic: true });
    ctx.fillStyle = C.muted;
    ctx.fillText("No description provided.", PAD, 36);
    return c.toBuffer("image/png") as unknown as Buffer;
  }

  // Enable GitHub Flavored Markdown (tables, strikethrough, task lists)
  marked.use({ gfm: true });
  const tokens = marked.lexer(body);

  // Prefetch all referenced images in parallel
  const imageUrls = collectImageUrls(tokens as Token[]);
  const images = await prefetchImages(imageUrls);

  // ── Pass 1: dry-run to measure height ──────────────────────────────────────
  const mc = createCanvas(IMG_WIDTH, MAX_H);
  const ms = makeS(mc.getContext("2d"), images);
  renderAll(ms, tokens as Token[]);
  const finalH = Math.min(ms.y + PAD, MAX_H);

  // ── Pass 2: render onto correctly-sized canvas ─────────────────────────────
  const canvas = createCanvas(IMG_WIDTH, finalH);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, IMG_WIDTH, finalH);

  renderAll(makeS(ctx, images), tokens as Token[]);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

/**
 * Build a multipart/form-data body for attaching the PNG to a Discord
 * REST call.
 *
 * The caller's JSON payload should include:
 *   embed.image = { url: "attachment://body.png" }
 *   data.attachments = [{ id: 0, filename: "body.png" }]
 */
export function buildAttachmentPayload(
  jsonPayload: Record<string, unknown>,
  pngBuffer: Buffer,
  filename = "body.png"
): { body: Buffer; contentType: string } {
  const boundary = `GitbotBoundary${Date.now()}`;
  const json = JSON.stringify(jsonPayload);
  const CRLF = "\r\n";

  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="payload_json"${CRLF}` +
        `Content-Type: application/json${CRLF}${CRLF}` +
        `${json}${CRLF}`
    ),
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="files[0]"; filename="${filename}"${CRLF}` +
        `Content-Type: image/png${CRLF}${CRLF}`
    ),
    pngBuffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ];

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
