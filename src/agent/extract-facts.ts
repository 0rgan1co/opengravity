import Groq from "groq-sdk";
import { config } from "../config.js";
import { dbService } from "../db/sqlite.js";

const groq = new Groq({ apiKey: config.apiKeys.groq });

export async function backgroundFactExtraction(userId: number, userText: string, assistantResponse: string) {
    try {
        const prompt = `
Extract durable facts about the user from the following exchange. 
Durable facts include: name, age, physical traits, preferences, important dates, location, professional info, and life goals.
Do not extract transient state (like "user is happy right now" or "user is asking for the time").
If there are no new durable facts, return "NO_FACTS".
Otherwise, return the facts as a list, one fact per line.

User says: "${userText}"
Agent says: "${assistantResponse}"
    `.trim();

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
        });

        const output = response.choices[0]?.message?.content?.trim();

        if (output && output !== "NO_FACTS" && !output.includes("NO_FACTS")) {
            const facts = output.split('\n').filter(line => line.trim().length > 0);
            for (let fact of facts) {
                // Sanitize bullets if present
                fact = fact.replace(/^[-*•]\s*/, '').trim();
                if (fact) dbService.addFact(userId, fact);
            }
        }
    } catch (error) {
        console.error("Fact extraction failed:", error);
    }
}

export async function backgroundCompaction(userId: number) {
    try {
        const count = dbService.getMessageCount(userId);
        if (count <= 30) return; // Keep context window lean

        console.log(`Running compaction for user ${userId} (total messages ${count} > 30)...`);

        const history = dbService.getHistory(userId, count); // get all
        const oldMessages = history.slice(0, history.length - 20); // we keep the latest 20 as active memory

        let transcript = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n');

        const prompt = `
Summarize the following conversation segment concisely. Retain the overall meaning and any decisions made, but compress the tokens.

Transcript:
${transcript}
     `.trim();

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }]
        });

        const summary = response.choices[0]?.message?.content?.trim();
        if (summary) {
            dbService.addSummary(userId, summary);
            // prune the old messages and retain latest 20
            dbService.deleteOldestMessages(userId, 20);
        }
    } catch (error) {
        console.error("Compaction failed:", error);
    }
}
