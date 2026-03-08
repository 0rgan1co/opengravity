import { dbService } from "../db/sqlite.js";
import { pineconeService } from "../db/pinecone.js";
import { supabaseService } from "../db/supabase.js";

export const AVAILABLE_TOOLS = [
    {
        type: "function",
        function: {
            name: "get_current_time",
            description: "Gets the current date and time in ISO format.",
            parameters: {
                type: "object",
                properties: {
                    timezone: {
                        type: "string",
                        description: "Optional timezone string. Defaults to undefined (local time).",
                    },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "remember_fact",
            description: "Explicitly store a fact to your core memory.",
            parameters: {
                type: "object",
                properties: {
                    fact: {
                        type: "string",
                        description: "The fact to remember about the user."
                    }
                },
                required: ["fact"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "recall_memory",
            description: "Search specific topics in semantic memory and retrieve user facts.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The topic or query to search for in past conversations." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "add_to_memory",
            description: "Ingest long text, transcripts or URLs into the long-term knowledge base.",
            parameters: {
                type: "object",
                properties: {
                    content: { type: "string", description: "The text content to store." }
                },
                required: ["content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "save_data",
            description: "Save structured analytics or metrics to the cloud database.",
            parameters: {
                type: "object",
                properties: {
                    key: { type: "string" },
                    value: { type: "string", description: "JSON stringified value" },
                    data_type: { type: "string", enum: ["number", "text", "json"] }
                },
                required: ["key", "value", "data_type"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "query_data",
            description: "Query structured data from the cloud database.",
            parameters: {
                type: "object",
                properties: {
                    key: { type: "string" }
                },
                required: ["key"]
            }
        }
    }
];

export async function executeTool(name: string, args: any, userId: number): Promise<any> {
    console.log(`Executing tool: ${name} with args:`, args);

    switch (name) {
        case "get_current_time":
            return get_current_time(args);

        case "remember_fact":
            dbService.addFact(userId, args.fact);
            return `Fact '${args.fact}' remembered successfully.`;

        case "recall_memory":
            const [facts, semantics] = await Promise.all([
                Promise.resolve(dbService.getFacts(userId)),
                pineconeService.searchMemory(userId, args.query, 3).catch(() => [] as string[])
            ]);
            return {
                core_facts: facts.map(f => f.fact),
                semantic_matches: semantics
            };

        case "add_to_memory":
            // Notice: Pinecone text ingest might fail if keys are missing but it degenerates gracefully. 
            await pineconeService.addToKnowledge(userId, args.content);
            return `Added content to long-term storage successfully.`;

        case "save_data":
            await supabaseService.saveData(userId, args.key, args.value, args.data_type);
            return `Data for key ${args.key} saved properly.`;

        case "query_data":
            const data = await supabaseService.queryData(userId, args.key);
            return data !== null ? data : `Key not found or error.`;

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

function get_current_time(args: { timezone?: string }): string {
    try {
        if (args.timezone) {
            return new Date().toLocaleString("en-US", { timeZone: args.timezone });
        }
        return new Date().toISOString();
    } catch (error) {
        return new Date().toISOString();
    }
}
