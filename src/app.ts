// Libraries
import express from "express";
import swaggerUi from "swagger-ui-express";

// Files
import { config } from "./config.js";
import { endpoints } from "./endpoints/endpoints.js";
import { openApiDocument } from "./openapi.js";

// Middlewares
import { middlewareErrorHandler } from "./middlewares/error_handler.js";

export const app = express();

// Express defaults JSON request bodies to 100 KB.
// Log batches may exceed that, so use the configured higher limit.
app.use(
    express.json({
        limit: config.server.bodyLimit
    })
);
app.use(swaggerUi.serve);
app.get("/", swaggerUi.setup(openApiDocument));
app.use(endpoints);
app.use(middlewareErrorHandler);
