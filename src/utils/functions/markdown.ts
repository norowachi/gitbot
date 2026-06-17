/**
 * Renders a Markdown string into a PNG Buffer suitable for attaching
 * to Discord messages as a file upload.
 *
 * Supports:
 *  - Headings h1-h6 (with underline rule on h1/h2)
 *  - Nested inline styles: bold, italic, bold-italic, strikethrough, underline
 *  - Inline code spans (atomic pill, spaces preserved)
 *  - Fenced code blocks with language label and clipped content
 *  - Links with nested inline styles (bold/italic link text)
 *  - Blockquotes, nested to any depth, with tinted accent bars
 *  - Ordered, unordered, and task lists (nested, unlimited depth)
 *  - Tables with per-column alignment
 *  - Inline images fetched from https URLs and rendered in-flow
 *  - Block images (standalone paragraph with single image token)
 *  - Hard line breaks (\\ or two trailing spaces)
 *  - Horizontal rules
 *  - <details> collapsed to summary pill (non-interactive static image)
 *  - All other HTML / comments silently stripped
 */

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { marked, type Token, type Tokens } from "marked";

// ─── Configure marked once at module load ─────────────────────────────────────
// marked.use is additive/global — calling it per-invocation stacks extensions.
marked.use({ gfm: true });

// ─── Layout constants ─────────────────────────────────────────────────────────

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

// ─── Inline style descriptor ──────────────────────────────────────────────────

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

// ─── Inline segment types ─────────────────────────────────────────────────────

type TextSeg = { kind: "text"; text: string } & Style;
type CodeSeg = { kind: "code"; text: string };
/** Link segs are flattened to their children with link color already applied. */
type LinkSeg = { kind: "link"; segs: InlineSeg[] };
type ImageSeg = { kind: "image"; src: string; alt: string };
type BrSeg = { kind: "br" };

type InlineSeg = TextSeg | CodeSeg | LinkSeg | ImageSeg | BrSeg;

// ─── Inline token → segment parser ───────────────────────────────────────────

function parseInline(tokens: Token[] | undefined, style: Style): InlineSeg[] {
  if (!tokens || tokens.length === 0) return [];
  const out: InlineSeg[] = [];

  for (const tok of tokens) {
    switch (tok.type) {
      case "text": {
        const t = tok as Tokens.Text;
        if (t.tokens?.length) {
          // Inline children present (e.g. bold inside text)
          out.push(...parseInline(t.tokens as Token[], style));
        } else if (t.text) {
          out.push({ kind: "text", text: t.text, ...style });
        }
        break;
      }

      case "strong":
        out.push(
          ...parseInline((tok as Tokens.Strong).tokens as Token[], { ...style, bold: true })
        );
        break;

      case "em":
        out.push(...parseInline((tok as Tokens.Em).tokens as Token[], { ...style, italic: true }));
        break;

      case "del":
        out.push(
          ...parseInline((tok as Tokens.Del).tokens as Token[], {
            ...style,
            strike: true,
            color: C.del,
          })
        );
        break;

      case "codespan":
        if (tok.text) out.push({ kind: "code", text: tok.text });
        break;

      case "link": {
        const lt = tok as Tokens.Link;
        const segs = parseInline(lt.tokens as Token[], { ...style, color: C.link });
        if (segs.length) out.push({ kind: "link", segs });
        break;
      }

      case "image":
        out.push({
          kind: "image",
          src: (tok as Tokens.Image).href,
          alt: (tok as Tokens.Image).text,
        });
        break;

      case "br":
        out.push({ kind: "br" });
        break;

      case "escape":
        if (tok.text) out.push({ kind: "text", text: tok.text, ...style });
        break;

      case "html": {
        // Inline HTML: surface <summary> from <details>, strip everything else
        const raw = ((tok as any).raw as string) ?? "";
        const m = raw.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
        if (m) {
          const txt = m[1].replace(/<[^>]+>/g, "").trim();
          if (txt) out.push({ kind: "text", text: `▶ ${txt}`, ...style, color: C.muted });
        }
        break;
      }

      default:
        // Unknown inline token: emit .text if available, never emit .raw
        // (raw contains markdown syntax characters)
        if ("text" in tok && typeof (tok as any).text === "string" && (tok as any).text) {
          out.push({ kind: "text", text: (tok as any).text as string, ...style });
        }
        break;
    }
  }

  return out;
}

// ─── Font helper ──────────────────────────────────────────────────────────────

function applyFont(ctx: SKRSContext2D, s: Pick<Style, "size" | "bold" | "italic" | "mono">): void {
  ctx.font = `${s.italic ? "italic " : ""}${s.bold ? "bold " : ""}${s.size}px ${s.mono ? MON : SAN}`;
}

// ─── Rounded-rect helper ──────────────────────────────────────────────────────

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

type LoadedImage = Awaited<ReturnType<typeof loadImage>>;

interface S {
  ctx: SKRSContext2D;
  y: number;
  images: Map<string, LoadedImage | null>;
}

function makeS(ctx: SKRSContext2D, images: S["images"]): S {
  return { ctx, y: PAD, images };
}

// ─── Inline renderer ──────────────────────────────────────────────────────────

/**
 * Render a flat list of InlineSegs onto the canvas with word-wrapping.
 *
 * Correct Y accounting:
 *  - `lineY` is the BASELINE of the current line.
 *  - `s.y` is set to `lineY + lh` at exit — i.e. the top of the space
 *    below the last rendered line, ready for the next block element.
 *  - If `segs` is empty nothing is drawn and `s.y` is NOT advanced
 *    (avoids phantom blank lines for empty items).
 *
 * @param s      render state
 * @param segs   flat segment list from parseInline()
 * @param lh     line-height in px (baseline to baseline)
 * @param xLeft  absolute canvas x of left edge
 * @param maxW   available width in px
 */
function renderInline(s: S, segs: InlineSeg[], lh: number, xLeft: number, maxW: number): void {
  if (segs.length === 0) return; // nothing to render — do not advance y

  const { ctx } = s;
  let x = xLeft;
  let lineY = s.y;
  let rendered = false;

  const nl = () => {
    lineY += lh;
    x = xLeft;
  };

  for (const seg of segs) {
    // ── Hard break ───────────────────────────────────────────────────────────
    if (seg.kind === "br") {
      nl();
      rendered = true;
      continue;
    }

    // ── Inline image ─────────────────────────────────────────────────────────
    if (seg.kind === "image") {
      const img = s.images.get(seg.src);
      if (img) {
        rendered = true;
        const ratio = img.width / img.height;
        const drawH = Math.min(Math.min(img.width, maxW) / ratio, IMG_MAX_H);
        const drawW = drawH * ratio;
        if (x + drawW > xLeft + maxW && x > xLeft) nl();
        ctx.drawImage(img, x, lineY - BASE_SZ, drawW, drawH);
        x += drawW + 4;
      }
      continue;
    }

    // ── Inline code span ─────────────────────────────────────────────────────
    // Rendered as a single atomic pill — spaces and special chars are preserved.
    if (seg.kind === "code") {
      rendered = true;
      const cSz = BASE_SZ - 1;
      applyFont(ctx, { ...BASE_STYLE, mono: true, size: cSz });
      const tw = ctx.measureText(seg.text).width;
      const hPad = 6;
      const vPad = 2;
      const pillW = tw + hPad * 2;
      const pillH = cSz + vPad * 2 + 2;

      if (x + pillW > xLeft + maxW && x > xLeft) nl();

      ctx.fillStyle = C.inline_code_bg;
      ctx.fillRect(x, lineY - cSz + vPad, pillW, pillH);
      ctx.fillStyle = C.code_text;
      ctx.fillText(seg.text, x + hPad, lineY + vPad);

      x += pillW + 2;
      continue;
    }

    // ── Link (children already carry link color) ──────────────────────────────
    // Render link children inline at the current cursor position.
    // We do NOT recurse into renderInline here — that would restart lineY.
    // Instead, we expand link segs and process them in-place in this loop.
    if (seg.kind === "link") {
      // Insert the link's segs into the processing queue inline
      // by recursing but passing current x offset as xLeft.
      // We capture y before and after to correctly update lineY.
      s.y = lineY;
      renderInline(s, seg.segs, lh, x, maxW - (x - xLeft));
      // After the recursive call, s.y = lastLineY + lh.
      // We want to resume on that same last line at whatever x we ended up.
      // Since we can't recover x from the recursive call, we conservatively
      // move to the start of the line below the link block.
      lineY = s.y - lh;
      x = xLeft;
      rendered = true;
      continue;
    }

    // ── Styled text ───────────────────────────────────────────────────────────
    {
      rendered = true;
      applyFont(ctx, seg);
      const sp = ctx.measureText(" ").width;

      // Handle embedded hard newlines (from marked's text tokens)
      const parts = seg.text.split("\n");
      for (let pi = 0; pi < parts.length; pi++) {
        if (pi > 0) nl();

        const words = parts[pi].split(" ");
        for (let wi = 0; wi < words.length; wi++) {
          const word = words[wi];

          // Empty string between two spaces — preserve the space
          if (word === "") {
            x += sp;
            continue;
          }

          // Re-apply font: prior iterations may have changed it (e.g. code span)
          applyFont(ctx, seg);
          const tw = ctx.measureText(word).width;

          if (x + tw > xLeft + maxW && x > xLeft) nl();

          ctx.fillStyle = seg.color;
          ctx.fillText(word, x, lineY);

          // Strikethrough
          if (seg.strike) {
            ctx.fillStyle = seg.color;
            ctx.fillRect(x, lineY - seg.size * 0.35, tw, 1);
          }

          // Underline
          if (seg.underline) {
            ctx.fillStyle = seg.color;
            ctx.fillRect(x, lineY + 2, tw, 1);
          }

          x += tw + (wi < words.length - 1 ? sp : 0);
        }
      }
    }
  }

  // Only advance s.y if we actually rendered something
  if (rendered) {
    s.y = lineY + lh;
  }
}

// ─── Block element renderers ──────────────────────────────────────────────────

function drawHeading(s: S, tok: Tokens.Heading): void {
  const szMap: Record<number, number> = { 1: 30, 2: 24, 3: 20, 4: 17, 5: 15, 6: 14 };
  const sz = szMap[tok.depth] ?? BASE_SZ;
  const lh = sz * 1.5;

  s.y += tok.depth <= 2 ? 20 : 12;

  const segs = parseInline(tok.tokens as Token[], {
    ...BASE_STYLE,
    bold: true,
    size: sz,
    color: C.heading,
  });
  renderInline(s, segs, lh, PAD, INNER_W);

  if (tok.depth <= 2) {
    s.ctx.fillStyle = C.rule;
    // Rule sits just below the last line of heading text
    s.ctx.fillRect(PAD, s.y - lh * 0.25, INNER_W, 1);
    s.y += 6;
  }

  s.y += 4;
}

function drawParagraph(s: S, tok: Tokens.Paragraph): void {
  const toks = tok.tokens as Token[] | undefined;

  // A paragraph with a single image token → block image
  if (toks?.length === 1 && toks[0].type === "image") {
    drawBlockImage(s, toks[0] as Tokens.Image);
    return;
  }

  s.y += 2;
  const segs = parseInline(toks, BASE_STYLE);
  renderInline(s, segs, BASE_LH, PAD, INNER_W);
  s.y += 4;
}

function drawBlockImage(s: S, tok: Tokens.Image): void {
  const img = s.images.get(tok.href);

  if (!img) {
    // Fallback: italicised alt text
    s.y += 4;
    renderInline(
      s,
      [
        {
          kind: "text",
          text: `[image: ${tok.text || tok.href}]`,
          ...BASE_STYLE,
          color: C.muted,
          italic: true,
        },
      ],
      BASE_LH,
      PAD,
      INNER_W
    );
    s.y += 4;
    return;
  }

  const ratio = img.width / img.height;
  const drawW = Math.min(img.width, IMG_MAX_W);
  // Constrain height; recompute width from constrained height if needed
  const drawH = Math.min(drawW / ratio, IMG_MAX_H);
  const finalW = drawH * ratio;

  s.y += 8;
  s.ctx.save();
  roundRect(s.ctx, PAD, s.y, finalW, drawH, 6);
  s.ctx.clip();
  s.ctx.drawImage(img, PAD, s.y, finalW, drawH);
  s.ctx.restore();
  s.y += drawH;

  if (tok.text) {
    s.y += 4;
    applyFont(s.ctx, { ...BASE_STYLE, italic: true, size: 12 });
    s.ctx.fillStyle = C.muted;
    s.ctx.fillText(tok.text, PAD, s.y);
    s.y += 16;
  } else {
    s.y += 12;
  }
}

function drawList(s: S, tok: Tokens.List, depth = 0): void {
  const indent = depth * 22;
  const bulletX = PAD + indent;
  const textX = bulletX + 22;
  const maxW = INNER_W - indent - 22;

  for (let i = 0; i < tok.items.length; i++) {
    const item = tok.items[i];
    const isTask = item.task;
    const checked = item.checked ?? false;

    // ── Reserve the baseline for this item ──────────────────────────────────
    // We need s.y to be the baseline where text/checkbox will land.
    // renderInline will set s.y; we save it beforehand for the checkbox.
    const itemBaselineY = s.y;

    // ── Bullet or number (drawn at the item's initial baseline) ────────────
    if (!isTask) {
      applyFont(s.ctx, BASE_STYLE);
      s.ctx.fillStyle = C.bullet;
      const label = tok.ordered ? `${i + 1}.` : depth === 0 ? "•" : depth === 1 ? "◦" : "▪";
      s.ctx.fillText(label, bulletX, itemBaselineY);
    }

    // ── Item body text ───────────────────────────────────────────────────────
    // marked wraps list item text in a paragraph token when it has block
    // children. We flatten one level: if the first child is a paragraph,
    // use its inline tokens rather than the item's raw tokens.
    let inlineTokens: Token[] = item.tokens as Token[];
    const firstChild = inlineTokens[0];
    if (firstChild?.type === "paragraph") {
      inlineTokens = (firstChild as Tokens.Paragraph).tokens as Token[];
    }

    const segs = parseInline(inlineTokens, BASE_STYLE);
    renderInline(s, segs, BASE_LH, textX, maxW);

    // If renderInline rendered nothing (empty item), still advance one line
    if (s.y === itemBaselineY) s.y += BASE_LH;

    // ── Task checkbox — drawn at the item's first-line baseline ────────────
    // (drawn after renderInline so we use the confirmed baseline position)
    if (isTask) {
      const cbSz = BASE_SZ;
      const cbTop = itemBaselineY - cbSz + 2;

      s.ctx.strokeStyle = checked ? C.task_done : C.task_todo;
      s.ctx.lineWidth = 1.5;
      s.ctx.strokeRect(bulletX, cbTop, cbSz, cbSz);

      if (checked) {
        // Filled checkmark tick
        s.ctx.beginPath();
        s.ctx.moveTo(bulletX + 3, cbTop + cbSz * 0.55);
        s.ctx.lineTo(bulletX + cbSz * 0.4, cbTop + cbSz * 0.8);
        s.ctx.lineTo(bulletX + cbSz - 3, cbTop + cbSz * 0.2);
        s.ctx.strokeStyle = C.task_done;
        s.ctx.lineWidth = 1.8;
        s.ctx.stroke();
      }
    }

    // ── Nested block children (sub-lists, blockquotes inside items) ─────────
    for (const child of item.tokens ?? []) {
      if (child.type === "list") {
        drawList(s, child as Tokens.List, depth + 1);
      } else if (child.type === "blockquote") {
        drawBlockquote(s, child as Tokens.Blockquote, textX - PAD);
      } else if (child.type === "code") {
        drawCode(s, child as Tokens.Code);
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
  const ipad = 14;
  const lines = (tok.text ?? "").split("\n");
  const hasLang = Boolean(tok.lang);
  // Full box height: padding top + optional lang bar + lines + padding bottom
  const boxH = ipad + (hasLang ? 20 : 0) + lines.length * lh + ipad;

  s.y += 8;
  const boxY = s.y;

  // Background
  ctx.fillStyle = C.code_bg;
  roundRect(ctx, PAD, boxY, INNER_W, boxH, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, boxY, INNER_W, boxH, 6);
  ctx.stroke();

  s.y += ipad;

  if (hasLang) {
    applyFont(ctx, { ...BASE_STYLE, mono: true, size: 11 });
    ctx.fillStyle = C.muted;
    ctx.fillText(tok.lang!, PAD + ipad, s.y);
    s.y += 18;
    // Separator between lang and code
    ctx.fillStyle = C.border;
    ctx.fillRect(PAD, s.y - 4, INNER_W, 1);
    s.y += 4;
  }

  applyFont(ctx, { ...BASE_STYLE, mono: true, size: sz });
  ctx.fillStyle = C.code_text;

  // Clip to box interior — long lines are truncated visually rather than
  // overflowing the rounded background rect.
  ctx.save();
  // Clip rect: starts at the top of the code area (s.y - sz for the ascender)
  ctx.rect(PAD + ipad, boxY + ipad - 2, INNER_W - ipad * 2, boxH - ipad * 2 + 4);
  ctx.clip();
  for (const line of lines) {
    ctx.fillText(line, PAD + ipad, s.y);
    s.y += lh;
  }
  ctx.restore();

  s.y = boxY + boxH + 8; // jump to exactly below the box
}

const QUOTE_INDENT = 20;
const QUOTE_BAR_W = 3;
const QUOTE_BAR_GAP = 8;
const QUOTE_COLORS = ["#5865f2", "#4e5058", "#3a3c40"] as const;

function drawBlockquote(s: S, tok: Tokens.Blockquote, extraIndent = 0): void {
  const textX = PAD + extraIndent + QUOTE_BAR_W + QUOTE_BAR_GAP;
  const maxW = INNER_W - extraIndent - QUOTE_BAR_W - QUOTE_BAR_GAP;
  const startY = s.y;

  s.y += 4;

  for (const inner of tok.tokens) {
    switch (inner.type) {
      case "paragraph": {
        const segs = parseInline((inner as Tokens.Paragraph).tokens as Token[], {
          ...BASE_STYLE,
          color: C.quote_text,
        });
        renderInline(s, segs, BASE_LH, textX, maxW);
        break;
      }
      case "blockquote":
        drawBlockquote(s, inner as Tokens.Blockquote, extraIndent + QUOTE_INDENT);
        break;
      case "code":
        drawCode(s, inner as Tokens.Code);
        break;
      case "list":
        drawList(s, inner as Tokens.List);
        break;
      case "heading":
        drawHeading(s, inner as Tokens.Heading);
        break;
      case "space":
        s.y += BASE_LH * 0.4;
        break;
      default:
        break;
    }
  }

  s.y += 4;

  // Accent bar — drawn after content so we know the true height
  const depth = Math.min(Math.floor(extraIndent / QUOTE_INDENT), QUOTE_COLORS.length - 1);
  s.ctx.fillStyle = QUOTE_COLORS[depth];
  s.ctx.fillRect(PAD + extraIndent, startY, QUOTE_BAR_W, s.y - startY);

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
  const totalH = rowH * (1 + tok.rows.length);
  const tableY = s.y;

  // ── Outer border (drawn first so fill paints over it inside) ──────────────
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, tableY, INNER_W, totalH, 4);
  ctx.stroke();

  // ── Header: fill a plain rect clipped to the outer rounded border ─────────
  ctx.save();
  roundRect(ctx, PAD, tableY, INNER_W, totalH, 4);
  ctx.clip();

  ctx.fillStyle = C.table_header_bg;
  ctx.fillRect(PAD, tableY, INNER_W, rowH);

  // Header text
  applyFont(ctx, { ...BASE_STYLE, bold: true });
  ctx.fillStyle = C.heading;

  for (let c = 0; c < cols; c++) {
    const cell = tok.header[c];
    const txt = cell?.text ?? "";
    applyFont(ctx, { ...BASE_STYLE, bold: true });
    const tw = ctx.measureText(txt).width;
    const align = tok.align?.[c];
    const cx = PAD + c * colW;
    let tx = cx + ipad;
    if (align === "center") tx = cx + colW / 2 - tw / 2;
    if (align === "right") tx = cx + colW - tw - ipad;

    ctx.fillStyle = C.heading;
    ctx.fillText(txt, tx, tableY + rowH * 0.65);
  }

  // Header/body separator
  ctx.fillStyle = C.rule;
  ctx.fillRect(PAD, tableY + rowH, INNER_W, 1);

  // Body rows
  for (let r = 0; r < tok.rows.length; r++) {
    const rowY = tableY + rowH * (r + 1);
    ctx.fillStyle = r % 2 === 0 ? C.surface2 : C.table_alt_bg;
    ctx.fillRect(PAD, rowY, INNER_W, rowH);

    applyFont(ctx, BASE_STYLE);
    for (let c = 0; c < cols; c++) {
      const cell = tok.rows[r][c];
      const txt = cell?.text ?? "";
      const align = tok.align?.[c];
      const cx = PAD + c * colW;
      const tw = ctx.measureText(txt).width;
      let tx = cx + ipad;
      if (align === "center") tx = cx + colW / 2 - tw / 2;
      if (align === "right") tx = cx + colW - tw - ipad;

      ctx.fillStyle = C.text;
      ctx.fillText(txt, tx, rowY + rowH * 0.65);
    }
  }

  // Column dividers (vertical lines between columns)
  ctx.fillStyle = C.border;
  for (let c = 1; c < cols; c++) {
    ctx.fillRect(PAD + c * colW, tableY, 1, totalH);
  }

  ctx.restore();
  s.y = tableY + totalH + 10;
}

// ─── HTML block renderer ──────────────────────────────────────────────────────

function drawHtmlBlock(s: S, tok: Tokens.HTML): void {
  const raw = tok.raw ?? tok.text ?? "";

  // <details> → collapsed pill showing only the summary text
  if (/<details[\s>]/i.test(raw)) {
    const m = raw.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const summaryText = m ? m[1].replace(/<[^>]+>/g, "").trim() : "Details";

    const ctx = s.ctx;
    const pillH = BASE_SZ + 14;
    const pillY = s.y;

    s.y += 6;

    // Pill background
    ctx.fillStyle = C.surface;
    roundRect(ctx, PAD, pillY, INNER_W, pillH, 4);
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    roundRect(ctx, PAD, pillY, INNER_W, pillH, 4);
    ctx.stroke();

    const textBaseline = pillY + pillH * 0.65;

    // ▶ arrow
    applyFont(ctx, { ...BASE_STYLE, size: BASE_SZ - 1 });
    ctx.fillStyle = C.muted;
    ctx.fillText("▶", PAD + 10, textBaseline);

    // Summary text
    applyFont(ctx, BASE_STYLE);
    ctx.fillStyle = C.text;
    ctx.fillText(summaryText, PAD + 28, textBaseline);

    // Hint right-aligned
    applyFont(ctx, { ...BASE_STYLE, size: 11, italic: true });
    ctx.fillStyle = C.muted;
    const hint = "click to expand";
    const hintW = ctx.measureText(hint).width;
    ctx.fillText(hint, PAD + INNER_W - hintW - 10, textBaseline);

    s.y = pillY + pillH + 6;
    return;
  }

  // All other HTML (comments, raw tags) — silently drop.
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
    case "html":
      drawHtmlBlock(s, tok as Tokens.HTML);
      break;
    case "space":
      s.y += BASE_LH * 0.5;
      break;
    default:
      break;
  }
}

function renderAll(s: S, tokens: Token[]): void {
  for (const tok of tokens) renderToken(s, tok);
}

// ─── Image URL collector ──────────────────────────────────────────────────────

/**
 * Walk every token in the tree and collect image URLs for parallel prefetch.
 * Visits all known token shapes that can contain nested children.
 */
function collectImageUrls(tokens: Token[]): Set<string> {
  const urls = new Set<string>();

  function visit(tok: Token): void {
    if (tok.type === "image") {
      urls.add((tok as Tokens.Image).href);
      return;
    }
    // Visit inline children (paragraphs, headings, links, etc.)
    if ("tokens" in tok && Array.isArray((tok as any).tokens)) {
      for (const c of (tok as any).tokens as Token[]) visit(c);
    }
    // Visit list item children
    if (tok.type === "list") {
      for (const item of (tok as Tokens.List).items) {
        for (const c of (item.tokens ?? []) as Token[]) visit(c);
      }
    }
    // Visit blockquote children
    if (tok.type === "blockquote") {
      for (const c of (tok as Tokens.Blockquote).tokens) visit(c as Token);
    }
  }

  for (const tok of tokens) visit(tok);
  return urls;
}

async function prefetchImages(urls: Set<string>): Promise<Map<string, LoadedImage | null>> {
  const map = new Map<string, LoadedImage | null>();

  await Promise.all(
    [...urls].map(async (url) => {
      // Only allow https? to prevent path traversal via file:// or data: URIs
      if (!/^https?:\/\//i.test(url)) {
        map.set(url, null);
        return;
      }
      try {
        map.set(url, await loadImage(url));
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
 * Two-pass strategy:
 *  1. Render onto a scratch canvas of MAX_H to measure true content height.
 *  2. Render onto a correctly-sized canvas of exactly that height.
 *
 * Images are prefetched in parallel before either pass.
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

  const tokens = marked.lexer(body);

  const imageUrls = collectImageUrls(tokens as Token[]);
  const images = await prefetchImages(imageUrls);

  // Pass 1: measure
  const mc = createCanvas(IMG_WIDTH, MAX_H);
  const ms = makeS(mc.getContext("2d"), images);
  renderAll(ms, tokens as Token[]);
  const finalH = Math.min(ms.y + PAD, MAX_H);

  // Pass 2: render
  const canvas = createCanvas(IMG_WIDTH, finalH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, IMG_WIDTH, finalH);
  renderAll(makeS(ctx, images), tokens as Token[]);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

/**
 * Build a multipart/form-data body for a Discord REST call that attaches
 * the PNG as a file.
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
  const CRLF = "\r\n";
  const json = JSON.stringify(jsonPayload);

  const body = Buffer.concat([
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
  ]);

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
