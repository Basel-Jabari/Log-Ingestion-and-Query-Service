import { config } from "./config.js";
import { app } from "./app.js";

app.listen(config.server.port, () => {
    console.log(`Server is running at http://localhost:${config.server.port}`);
});
