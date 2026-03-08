import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";

// Tier 2: Pinecone Semantic Memory
// The associative memory layer. Every conversation exchange is embedded and stored.

export const pinecone = config.apiKeys.pinecone ? new Pinecone({ apiKey: config.apiKeys.pinecone }) : null;

export const pineconeService = {
    async embedAndStoreExchange(userId: number, text: string) {
        if (!pinecone) return;
        try {
            const index = pinecone.Index("gravity-claw");

            // Using integrated embeddings provided by Pinecone (multilingual-e5-large)
            await index.namespace("conversations").upsertRecords({
                records: [
                    {
                        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        text: text,
                        userId: userId,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
        } catch (e) {
            console.error("Tier 2 (Pinecone) embedding failed (fire and forget):", e);
        }
    },

    async searchMemory(userId: number, query: string, topK: number = 3): Promise<string[]> {
        if (!pinecone) return [];
        try {
            const index = pinecone.Index("gravity-claw");

            // Search using Pinecone integrated inference
            const response = await index.namespace("conversations").searchRecords({
                query: {
                    inputs: { text: query },
                    topK,
                    filter: { userId }
                }
            });

            // relevance threshold 0.3
            const matches = response.result?.hits || [];
            return matches
                .filter(m => (m._score || 0) > 0.3)
                .map(m => (m.fields as any)?.text as string)
                .filter(Boolean);
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

            await index.namespace("knowledge").upsertRecords({
                records: [
                    {
                        id: `know-${Date.now()}`,
                        text: text,
                        userId: userId,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
        } catch (e) {
            console.error("Tier 2 Knowledge error:", e);
        }
    }
};
