import Groq from "groq-sdk";
import OpenAI from "openai";
import { config } from "../config.js";
import { dbService, MessageRow } from "../db/sqlite.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { AVAILABLE_TOOLS, executeTool } from "./tools.js";

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
    // Add user message to DB
    dbService.addMessage(userId, "user", text);

    // Retrieve conversation history
    const history = dbService.getHistory(userId, 20); // Get last 20 messages for context

    // Prepare messages array for LLM
    const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
    ];

    for (const row of history) {
        if (row.role === "tool") continue; // We simplify and might not send raw tool returns if they are just conversational context
        messages.push({ role: row.role as any, content: row.content });
    }

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

            // If the model wants to call tools
            if (message.tool_calls && message.tool_calls.length > 0) {
                messages.push(message as any); // Add assistant message with tool calls

                for (const toolCall of message.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    let toolResult = "";
                    try {
                        toolResult = await executeTool(functionName, functionArgs);
                    } catch (error: any) {
                        toolResult = `Error executing tool: ${error.message}`;
                    }

                    // Convert object returns to string to append to context
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
                // Loop continues to let the LLM see the tool output and generate a final response
            } else {
                // No more tool calls, we have the final answer
                finalResponse = message.content || "";
                dbService.addMessage(userId, "assistant", finalResponse);
                break;
            }

        } catch (error: any) {
            console.error("Error calling LLM:", error);
            finalResponse = "Lo siento, ha ocurrido un error al procesar tu solicitud.";
            break;
        }
    }

    if (iterations >= MAX_ITERATIONS && !finalResponse) {
        finalResponse = "He alcanzado el límite de operaciones internas para esta solicitud.";
    }

    return finalResponse;
}

async function callLLM(messages: ChatMessage[]) {
    try {
        // Try Groq first
        return await groq.chat.completions.create({
            model: LLM_MODEL,
            messages: messages as any[],
            tools: AVAILABLE_TOOLS as any[],
            tool_choice: "auto",
        });
    } catch (error: any) {
        console.error("Groq API error, attempting fallback...", error.message);
        if (openai) {
            try {
                // Fallback to OpenRouter
                return await openai.chat.completions.create({
                    model: config.models.fallback,
                    messages: messages as any[],
                    tools: AVAILABLE_TOOLS as any[],
                    tool_choice: "auto",
                });
            } catch (fallbackError: any) {
                console.error("Fallback API error:", fallbackError);
                throw new Error("Both primary and fallback LLM requests failed.");
            }
        } else {
            throw error;
        }
    }
}
