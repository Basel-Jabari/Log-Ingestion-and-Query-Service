import { config } from "./config.js";
import { app } from "./app.js";
import { middlewareErrorHandler } from "./middlewares/error_handler.js";

app.listen(config.server.port, () => {
    console.log(`Server is running at http://localhost:${config.server.port}`);
});

app.use(middlewareErrorHandler);
