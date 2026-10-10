---
name: battlecards
description: Build competitive battlecards for a product and 1 to 10 competitor domains with looot-battlecards. Use when the user asks for a battlecard, a competitor one-pager, a pricing and positioning comparison, or competitor research with sources.
---

# Battlecards

Runs the `looot-battlecards` CLI from the repository root. Each card has pricing, positioning, news, hiring direction, tech stack, review themes and ad angles, and every claim carries a source link and the fetch date.

## Steps

1. Ask for the user's product name and 1 to 10 competitor domains. Optional: strengths of the product in the user's own words.
2. Price it first, free, no token needed:
   `npm run cards -- --product "<name>" --competitors a.com,b.com --dry-run`
   Show the list-price total to the user and wait for a yes. A typical competitor costs about $0.015.
3. Run it with a cap equal to the quote rounded up:
   `LOOOT_TOKEN=$LOOOT_TOKEN npm run cards -- --product "<name>" --competitors a.com,b.com --max-spend 0.10`
   If LOOOT_TOKEN is missing, tell the user to create an agent token at https://looot.ai/settings. Never ask for it in chat.
4. Read `cards/index.md`, then each `cards/<domain>.md`. Report sections marked "Nothing found", "Pending" or "Failed" as they are. Never fill a gap from memory.
5. For PDF, open `cards/<domain>.html` and use Print, Save as PDF.

## Rules

- Quote before every paid run. Respect the cap.
- A pending section is still running at looot. Re-run later on the same day: the same call replays for free.
- For change alerts on a competitor page, point to https://github.com/loootai/looot-monitor.
