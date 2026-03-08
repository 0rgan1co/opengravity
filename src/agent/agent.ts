import Groq from "groq-sdk";
import OpenAI from "openai";
import { config } from "../config.js";
import { dbService, MessageRow } from "../db/sqlite.js";
import { pineconeService } from "../db/pinecone.js";
import { supabaseService } from "../db/supabase.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { AVAILABLE_TOOLS, executeTool } from "./tools.js";
import { backgroundFactExtraction, backgroundCompaction } from "./extract-facts.js";

const groq = new Groq({ apiKey: config.apiKeys.groq });
const openai = config.apiKeys.openrouter
    ? new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: config.apiKeys.openrouter,
    })
    : null;

const LLM_MODEL = "llama-3.3-70b-versatile"; // Groq supported model
const MAX_ITERATIONS = 5;

type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_calls?: any[];
    tool_call_id?: string;
};

export async function processUserMessage(userId: number, text: string): Promise<string> {
    // Load Memory (parallel) - Tiers 1 and 2
    const [coreFacts, latestHistory, summaryObj, semanticResults] = await Promise.all([
        Promise.resolve(dbService.getFacts(userId)),
        Promise.resolve(dbService.getHistory(userId, 20)),
        Promise.resolve(dbService.getLatestSummary(userId)),
        pineconeService.searchMemory(userId, text, 3).catch(() => [] as string[])
    ]);

    // Build Context
    let contextualSystemPrompt = SYSTEM_PROMPT + "\n\n--- CURRENT USER CONTEXT ---\n";

    if (coreFacts && coreFacts.length > 0) {
        contextualSystemPrompt += "CORE FACTS ABOUT USER:\n";
        coreFacts.forEach(f => contextualSystemPrompt += `- ${f.fact}\n`);
    }

    if (summaryObj) {
        contextualSystemPrompt += `\nPAST CONVERSATION SUMMARY:\n${summaryObj.summary}\n`;
    }

    if (semanticResults && semanticResults.length > 0) {
        contextualSystemPrompt += `\nSEMANTIC RECALL (Matches to user query):\n`;
        semanticResults.forEach((str, i) => contextualSystemPrompt += `[Match ${i + 1}]: ${str}\n`);
    }

    // Prepend context to chat history
    const messages: ChatMessage[] = [
        { role: "system", content: contextualSystemPrompt },
    ];

    for (const row of latestHistory) {
        if (row.role === "tool") continue;
        messages.push({ role: row.role as any, content: row.content });
    }

    // Add the new user message (not yet in SQLite to keep DB non-blocking for inference generation if possible, but actually we should add it now)
    messages.push({ role: "user", content: text });

    let iterations = 0;
    let finalResponse = "";

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        try {
            const response = await callLLM(messages);
            const message = response.choices[0]?.message;

            if (!message) {
                throw new Error("Empty response from LLM");
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                messages.push(message as any);

                for (const toolCall of message.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    let toolResult = "";
                    try {
                        toolResult = await executeTool(functionName, functionArgs, userId);
                        supabaseService.logActivity(userId, `Tool:${functionName}`, JSON.stringify(functionArgs));
                    } catch (error: any) {
                        toolResult = `Error executing tool: ${error.message}`;
                        supabaseService.logActivity(userId, `ToolError:${functionName}`, error.message, "error");
                    }

                    if (typeof toolResult !== "string") {
                        toolResult = JSON.stringify(toolResult);
                    }

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: functionName,
                        content: toolResult
                    });
                }
            } else {
                finalResponse = message.content || "";
                break;
            }
        } catch (error: any) {
            console.error("Error calling LLM:", error);
            finalResponse = "Lo siento, ha ocurrido un error al procesar tu solicitud.";
            supabaseService.logActivity(userId, "AgentCrash", error.message, "error");
            break;
        }
    }

    if (iterations >= MAX_ITERATIONS && !finalResponse) {
        finalResponse = "He alcanzado el límite de operaciones internas para esta solicitud.";
    }

    // Background Tasks (Fire-and-forget)
    // Ensure the user text and final response are saved to sqlite
    dbService.addMessage(userId, "user", text);
    dbService.addMessage(userId, "assistant", finalResponse);

    // Tier 1 and Tier 2 background jobs
    setImmediate(() => {
        backgroundFactExtraction(userId, text, finalResponse);
        backgroundCompaction(userId);
        pineconeService.embedAndStoreExchange(userId, `User: ${text}\nNjambre: ${finalResponse}`);
        supabaseService.logActivity(userId, "ExchangeSaved", "Finished conversation cycle.");
    });

    return finalResponse;
}

async function callLLM(messages: ChatMessage[]) {
    try {
        return await groq.chat.completions.create({
            model: LLM_MODEL,
            messages: messages as any[],
            tools: AVAILABLE_TOOLS as any[],
            tool_choice: "auto",
        });
    } catch (error: any) {
        console.error("Groq API error, attempting fallback...", error.message);
        if (openai) {
            return await openai.chat.completions.create({
                model: config.models.fallback,
                messages: messages as any[],
                tools: AVAILABLE_TOOLS as any[],
                tool_choice: "auto",
            });
        } else {
            throw error;
        }
    }
}
