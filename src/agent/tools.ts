// Define the tools available to the agent

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
];

export async function executeTool(name: string, args: any): Promise<any> {
    console.log(`Executing tool: ${name} with args:`, args);

    switch (name) {
        case "get_current_time":
            return get_current_time(args);
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
