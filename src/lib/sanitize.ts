/**
 * Untrusted text (listings, messages, reviews, reports) is stored as plain
 * text and always rendered through React, which escapes it. These helpers
 * normalise it so hidden characters can't be used for spoofing or layout abuse.
 */

// C0/C1 control chars except tab/newline, bidi overrides, zero-width chars, BOM.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩​-‏⁠﻿]/g;

/** Single-line text: titles, names, brands. */
export function cleanLine(input: string, max = 200): string {
  return input
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/** Multi-line text: descriptions, messages. Keeps paragraphs, drops excess blank lines. */
export function cleanText(input: string, max = 4000): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/\t/g, " ")
    .replace(/[  ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim()
    .slice(0, max);
}

/** Wear notes are entered one per line; normalise into a clean list. */
export function wearList(notes: string): string[] {
  return cleanText(notes, 2000)
    .split("\n")
    .map((l) => l.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean);
}

/** Flags common off-platform payment patterns so the UI can warn the reader. */
export function looksLikeOffPlatformPayment(text: string): boolean {
  return /\b(venmo|zelle|cash ?app|paypal\.me|western union|wire transfer|gift ?cards?|crypto|bitcoin|whats ?app|telegram)\b/i.test(text);
}
