import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_ALLOWED_USER_IDS,
    GROQ_API_KEY,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    DB_PATH,
    PINECONE_API_KEY,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing in .env");
}

if (!TELEGRAM_ALLOWED_USER_IDS) {
    throw new Error("TELEGRAM_ALLOWED_USER_IDS is missing in .env");
}

if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing in .env");
}

let allowedUserIds: number[] = [];
try {
    allowedUserIds = TELEGRAM_ALLOWED_USER_IDS.split(",").map((id) =>
        parseInt(id.trim(), 10)
    );
    if (allowedUserIds.some(isNaN)) {
        throw new Error("Invalid format for TELEGRAM_ALLOWED_USER_IDS");
    }
} catch (error) {
    throw new Error(
        "TELEGRAM_ALLOWED_USER_IDS must be a comma-separated list of numbers"
    );
}

export const config = {
    telegram: {
        botToken: TELEGRAM_BOT_TOKEN,
        allowedUserIds,
    },
    apiKeys: {
        groq: GROQ_API_KEY,
        openrouter: OPENROUTER_API_KEY || "",
        pinecone: PINECONE_API_KEY || "",
        supabaseUrl: SUPABASE_URL || "",
        supabaseKey: SUPABASE_ANON_KEY || "",
    },
    models: {
        fallback: OPENROUTER_MODEL || "openrouter/free",
    },
    db: {
        path: DB_PATH || "./gravity-claw.db",
    },
};
