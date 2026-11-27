export type AssistantLanguage = "hi" | "en";

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HINDI_ROMAN_MARKERS_RE =
  /\b(mera|meri|mere|mujhe|mujhko|hum|humko|aap|aapka|tum|karo|kardo|karna|karein|dikhao|dikhaiye|batao|bataiye|banao|banado|badha|badhao|samjhe|chahiye|nahi|nhi|kya|kab|kaun|kitne|kitna|bhej|bhejo|aaj|kal|parso|haan|bhai|bas|itna|gaya|rahi|raha|hain|hai|kaam|tarikh|kyu|kyunki|abhi|jaldi)\b/i;

const COMPLETION_CUES: readonly RegExp[] = [
  /(?:^|[\s,।.!?])(?:बस इतना ही|बस हो गया|हो गया|इतना ही|भेज दो|कर दो|बोल दिया)\s*[।.!?]*$/i,
  /(?:^|[\s,.!?])(?:bas itna hi|bas ho gaya|ho gaya|itna hi|bhej do|that's all|thats all|i am done|i'm done|done|over|send it|go ahead)\s*[.!?]*$/i,
];

export function detectSpeechLanguage(text: string): AssistantLanguage {
  const sample = String(text || "").trim();
  if (!sample) return "en";
  if (DEVANAGARI_RE.test(sample)) return "hi";
  if (HINDI_ROMAN_MARKERS_RE.test(sample)) return "hi";
  return "en";
}

export function stripCompletionCue(text: string): { cleaned: string; completed: boolean } {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { cleaned: "", completed: false };

  for (const pattern of COMPLETION_CUES) {
    if (pattern.test(trimmed)) {
      const cleaned = trimmed
        .replace(pattern, "")
        .replace(/[,،।]+$/, "")
        .trim();
      return { cleaned, completed: true };
    }
  }
  return { cleaned: trimmed, completed: false };
}

export interface VoiceProfile {
  voice: SpeechSynthesisVoice | null;
  langTag: string;
  pitch: number;
  rate: number;
  label: string;
}

const PREFERRED_HI_NAMES = ["swara", "google हिन्दी", "google hindi", "hemant", "kalpana", "lekha", "madhur"];
const PREFERRED_EN_NAMES = ["aria", "google us english", "google uk english", "ravi", "heera", "neerja", "samantha", "daniel", "jenny"];

function scoreVoice(voice: SpeechSynthesisVoice, targetLang: AssistantLanguage): number {
  const lang = (voice.lang || "").toLowerCase();
  const name = (voice.name || "").toLowerCase();
  let score = 0;

  if (targetLang === "hi") {
    if (lang === "hi-in" || lang === "hi_in") score += 100;
    else if (lang.startsWith("hi")) score += 80;
    else return -1;

    if (PREFERRED_HI_NAMES.some((hint) => name.includes(hint))) score += 25;
    if (name.includes("natural") || name.includes("online") || name.includes("google")) score += 15;
    return score;
  }

  if (lang.startsWith("hi")) return -1;
  if (lang === "en-in" || lang === "en_in") score += 95;
  else if (lang === "en-us" || lang === "en-gb") score += 90;
  else if (lang.startsWith("en")) score += 75;
  else return -1;

  if (PREFERRED_EN_NAMES.some((hint) => name.includes(hint))) score += 25;
  if (name.includes("natural") || name.includes("online") || name.includes("google")) score += 15;
  return score;
}

export function selectVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  language: AssistantLanguage,
): VoiceProfile {
  const ranked = voices
    .map((voice) => ({ voice, score: scoreVoice(voice, language) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0]?.voice || null;

  if (language === "hi") {
    return {
      voice: selected,
      langTag: selected?.lang || "hi-IN",
      pitch: 0.96,
      rate: 0.96,
      label: selected ? `Hindi (${selected.name})` : "Hindi (hi-IN)",
    };
  }

  return {
    voice: selected,
    langTag: selected?.lang || "en-IN",
    pitch: 1.07,
    rate: 1.04,
    label: selected ? `English (${selected.name})` : "English (en-IN)",
  };
}
