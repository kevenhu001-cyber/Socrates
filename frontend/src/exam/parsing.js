import { reportSwallow } from "../util/reportSwallow.ts";

const EXAM_THINKING_MARKUP = /<(?:thinking|think)>[\s\S]*?(<\/(?:thinking|think)>|$)/gi;
const EXAM_BRACKETED_THINKING_MARKUP = /\[(?:thinking|think)\][\s\S]*?(\[\/(?:thinking|think)\]|$)/gi;

function cleanExamResponse(text) {
  return text
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/\s*```/g, "")
    .replace(EXAM_THINKING_MARKUP, "")
    .replace(EXAM_BRACKETED_THINKING_MARKUP, "")
    .trim();
}

/** The best-effort language label included in generated question prompts. */
export function detectExamLang(topic) {
  if (!topic) return "English";
  if (/[一-鿿]/.test(topic)) return "Chinese";
  if (/[぀-ゟ゠-ヿ]/.test(topic)) return "Japanese";
  if (/[가-힯]/.test(topic)) return "Korean";
  if (/[Ѐ-ӿ]/.test(topic)) return "Russian";
  if (/[؀-ۿ]/.test(topic)) return "Arabic";
  if (/[ऀ-ॿ]/.test(topic)) return "Hindi";
  if (/[Ͱ-Ͽ]/.test(topic)) return "Greek";
  if (/[֐-׿]/.test(topic)) return "Hebrew";
  if (/[฀-๿]/.test(topic)) return "Thai";
  return "English";
}

export function parseSingleExamQuestion(text) {
  try {
    const raw = cleanExamResponse(String(text || ""));
    let idx = 0;
    const end = raw.lastIndexOf("}");
    if (end < 0) return null;
    while (idx <= end) {
      const start = raw.indexOf("{", idx);
      if (start < 0 || start >= end) return null;
      const jsonStr = raw.slice(start, end + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed.q === "string" && parsed.type) {
          if (parsed.type !== "multiple-choice" && parsed.type !== "fill-blank" && parsed.type !== "short-answer") {
            parsed.type = "fill-blank";
          }
          if (!parsed.explanation) parsed.explanation = "";
          return parsed;
        }
      } catch (error) {
        reportSwallow(error, "exam.parseSingleExamQuestion.innerSlice");
      }
      idx = start + 1;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function findBalancedSlice(text, openChar, closeChar) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === openChar) {
      if (depth === 0) start = i;
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseExamArrayJSON(text) {
  if (!text || typeof text !== "string") return null;
  const clean = cleanExamResponse(text);
  try {
    const direct = JSON.parse(clean);
    if (direct && Array.isArray(direct.questions)) return direct;
    if (Array.isArray(direct)) return { questions: direct };
  } catch (error) {
    reportSwallow(error, "exam.parseExamArrayJSON.directParse");
  }

  const objectSlice = findBalancedSlice(clean, "{", "}");
  if (objectSlice) {
    try {
      const parsed = JSON.parse(objectSlice);
      if (parsed && Array.isArray(parsed.questions)) return parsed;
      if (Array.isArray(parsed)) return { questions: parsed };
    } catch (error) {
      reportSwallow(error, "exam.findBalanced.bracedSlice");
    }
  }

  const arraySlice = findBalancedSlice(clean, "[", "]");
  if (arraySlice) {
    try {
      const parsed = JSON.parse(arraySlice);
      if (Array.isArray(parsed)) return { questions: parsed };
    } catch (error) {
      reportSwallow(error, "exam.findBalanced.bracketSlice");
    }
  }

  console.warn("[exam] parseExamArrayJSON failed. Raw response (first 800 chars):", text.slice(0, 800));
  return null;
}
