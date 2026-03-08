import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// Tier 3: Supabase Data Store
// The structured persistence layer. Stores arbitrary data, activity logs, cost tracking.

export const supabase = (config.apiKeys.supabaseUrl && config.apiKeys.supabaseKey)
    ? createClient(config.apiKeys.supabaseUrl, config.apiKeys.supabaseKey)
    : null;

export const supabaseService = {
    async logActivity(userId: number, action: string, details: string, status: string = "success") {
        if (!supabase) return;
        try {
            await supabase.from("activity_log").insert([{
                user_id: userId,
                action,
                details,
                status,
                timestamp: new Date().toISOString()
            }]);
        } catch (error) {
            console.error("Tier 3 Activity Log error:", error);
        }
    },

    async saveData(userId: number, key: string, value: any, dataType: string) {
        if (!supabase) return;
        try {
            await supabase.from("data_store").upsert([{
                user_id: userId,
                key,
                value: JSON.stringify(value),
                data_type: dataType,
                updated_at: new Date().toISOString()
            }], { onConflict: "user_id, key" });
        } catch (error) {
            console.error("Tier 3 Save Data error:", error);
        }
    },

    async queryData(userId: number, key: string) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from("data_store")
                .select("value")
                .eq("user_id", userId)
                .eq("key", key)
                .single();
            if (error) throw error;
            return data ? JSON.parse(data.value) : null;
        } catch (error) {
            console.error("Tier 3 Query Data error:", error);
            return null;
        }
    }
};
