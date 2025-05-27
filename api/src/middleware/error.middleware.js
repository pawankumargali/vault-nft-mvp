import { AxiosError } from "axios";

export class APIError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

export default function initErrorHandler(app) {
    app.use((error, _req, res, _next) => {
        if(error instanceof APIError) {
            return res.status(error.statusCode).json({error: error.message});
        } else {
            console.error(serializeError(error)); // It's good practice to log the actual error server-side
            return res.status(500).json({error: "Internal Server Error"}); // Generic message to client
        }
    });
}

export function serializeError(error) {
    try {
        if (typeof error === "string")
            return error; // Return string errors as-is
        else if(error instanceof AxiosError) {
            const err = error?.response?.data ?? error?.response;
            return JSON.stringify(err, null);
        }
        else if(error instanceof Error)
          throw error; //throw error so it can be handled by fallback catch block
        return JSON.stringify(error, null);
    } catch(e) {
        try {
            // Fallback: Build a detailed error object
            const errorDetails = {
                name: error?.name || "UnknownError",
                message: error?.message || "No message provided",
                stack: error?.stack || "No stack trace",
                ...Object.entries(error || {}).reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {}),
            };
            return JSON.stringify(errorDetails, null);
        } catch(e) {
          // Final fallback: Return error as-is if fallback fails
          console.log(`Error serialization failed: ${e?.message} - returning unknown error`);
          return "unknown error";
        }
    }
}
