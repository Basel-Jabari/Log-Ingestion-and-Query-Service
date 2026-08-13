// Libraries
import express from "express";

// Files
import { config } from "./config.js";
import { endpoints } from "./endpoints/endpoints.js";

// Middlewares
import { middlewareErrorHandler } from "./middlewares/error_handler.js";

export const app = express();

// The default limit is 100kb
// Since large batch of logs could exceed that
// I configured it to be higher in default
app.use(
    express.json({
        limit: config.server.bodyLimit
    })
);
app.use(endpoints);
app.use(middlewareErrorHandler);
