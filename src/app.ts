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

// Express defaults JSON request bodies to 100 KB
// Log batches may exceed that, so use the configured higher limit
app.use(
    express.json({
        limit: config.server.bodyLimit
    })
);

const swaggerPaths = ["/docs", "/swagger"];

// The Swagger page asks for its files with relative paths, like ./swagger-ui.css
// The browser resolves them correctly only when the address ends with a slash
// So /docs is redirected to /docs/
app.use(swaggerPaths, (req, res, next) => {
    const path = req.originalUrl.split("?")[0]!;

    if (req.path === "/" && !path.endsWith("/")) {
        res.redirect(`${path}/`);
        return;
    }

    next();
});
app.use(swaggerPaths, swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use(endpoints);
app.use(middlewareErrorHandler);
