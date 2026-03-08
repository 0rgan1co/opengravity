import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { config } from "../config.js";

// Tier 2: Pinecone Semantic Memory
// The associative memory layer. Every conversation exchange is embedded and stored.

export const pinecone = config.apiKeys.pinecone ? new Pinecone({ apiKey: config.apiKeys.pinecone }) : null;

// The embedding model used: multilingual-e5-large
const openai = config.apiKeys.openrouter
    ? new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: config.apiKeys.openrouter,
    })
    : null;

export const pineconeService = {
    async embedText(text: string): Promise<number[]> {
        if (!openai) throw new Error("OpenAI Client not initialized (OpenRouter key missing)");

        // Using a generic embedding model available or configured.
        // Replace with correct model identifier compatible with pinecone
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });

        return response.data[0].embedding;
    },

    async embedAndStoreExchange(userId: number, text: string) {
        if (!pinecone) return;
        try {
            const index = pinecone.Index("gravity-claw"); // Change to your actual pinecone index name
            const embedding = await this.embedText(text);

            await index.namespace("conversations").upsert([
                {
                    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    values: embedding,
                    metadata: { userId, text, timestamp: new Date().toISOString() },
                }
            ] as any);
        } catch (e) {
            console.error("Tier 2 (Pinecone) embedding failed (fire and forget):", e);
        }
    },

    async searchMemory(userId: number, query: string, topK: number = 3): Promise<string[]> {
        if (!pinecone) return [];
        try {
            const index = pinecone.Index("gravity-claw");
            const queryEmbedding = await this.embedText(query);

            const response = await index.namespace("conversations").query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true,
                filter: { userId }
            });

            // relevance threshold 0.3
            const matches = response.matches
                .filter(m => (m.score || 0) > 0.3)
                .map(m => m.metadata?.text as string)
                .filter(Boolean);
            return matches;
        } catch (e) {
            console.error("Tier 2 (Pinecone) search failed:", e);
            return [];
        }
    },

    async addToKnowledge(userId: number, text: string) {
        if (!pinecone) return;
        try {
            // Chunk text in practice here, saving the chunks to 'knowledge' namespace
            const index = pinecone.Index("gravity-claw");
            const embedding = await this.embedText(text);
            await index.namespace("knowledge").upsert([
                {
                    id: `know-${Date.now()}`,
                    values: embedding,
                    metadata: { userId, text, timestamp: new Date().toISOString() }
                }
            ] as any);
        } catch (e) {
            console.error("Tier 2 Knowledge error:", e);
        }
    }
};
