import type { VoiceGenderPref } from "@/lib/storage";

// The Web Speech API doesn't expose a gender field, so voices are classified by name —
// covers the common Chrome/Edge/Safari/Windows/Android voice names.
const FEMALE_HINTS = [
  "female",
  "zira",
  "samantha",
  "victoria",
  "susan",
  "karen",
  "tessa",
  "moira",
  "fiona",
  "allison",
  "ava",
  "serena",
  "emma",
  "joanna",
  "kimberly",
  "salli",
  "kendra",
  "amy",
  "ivy",
  "nicole",
  "catherine",
  "hazel",
  "aria",
  "jenny",
  "michelle",
];

const MALE_HINTS = [
  "male",
  "david",
  "alex",
  "daniel",
  "fred",
  "james",
  "george",
  "mark",
  "tom",
  "guy",
  "brian",
  "justin",
  "joey",
  "matthew",
  "russell",
  "eric",
  "ryan",
  "oliver",
  "arthur",
];

export function getEnglishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
}

export function classifyVoiceGender(voice: SpeechSynthesisVoice): VoiceGenderPref | null {
  const name = voice.name.toLowerCase();
  if (FEMALE_HINTS.some((hint) => name.includes(hint))) return "female";
  if (MALE_HINTS.some((hint) => name.includes(hint))) return "male";
  return null;
}

/** Resolves the best available voice for a gender preference, preferring English voices. */
export function pickVoiceForGender(voices: SpeechSynthesisVoice[], gender: VoiceGenderPref): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const english = getEnglishVoices(voices);
  const englishMatch = english.find((v) => classifyVoiceGender(v) === gender);
  if (englishMatch) return englishMatch;
  const anyMatch = voices.find((v) => classifyVoiceGender(v) === gender);
  if (anyMatch) return anyMatch;
  return english[0] ?? voices[0];
}
