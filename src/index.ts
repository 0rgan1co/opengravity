import { Bot } from "grammy";
import { config } from "./config.js";
import { processUserMessage } from "./agent/agent.js";

// Initialize the bot with the token from environment variables
const bot = new Bot(config.telegram.botToken);

// Middleware to check if the user is authorized
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId) {
        return;
    }

    // Check if user is in the allowed list
    if (!config.telegram.allowedUserIds.includes(userId)) {
        console.warn(`Unauthorized access attempt from user ID: ${userId}`);
        await ctx.reply("Lo siento, no estás autorizado para usar este bot.");
        return;
    }

    // Continue to next middleware if authorized
    await next();
});

// Setup command handlers
bot.command("start", async (ctx) => {
    await ctx.reply("¡Hola! Soy Njambre, tu asistente personal de IA. ¿En qué puedo ayudarte?");
});

// Setup message handler for all text messages
bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const userText = ctx.message.text;

    // Send a typing action to let the user know we are processing
    await ctx.replyWithChatAction("typing");

    try {
        const response = await processUserMessage(userId, userText);
        await ctx.reply(response);
    } catch (error: any) {
        console.error("Error handling message:", error);
        await ctx.reply("Ha ocurrido un error inesperado al procesar tu solicitud.");
    }
});

// Error handling for the bot
bot.catch((err) => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`);
    console.error(err.error);
});

// Start the bot
console.info("Starting Njambre bot...");
bot.start();

// Handle graceful shutdown
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
