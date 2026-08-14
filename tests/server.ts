import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { app } from "../src/app.js";

export const startTestServer = async () => {
    // Port 0 asks the operating system to select an available port
    // Bind to loopback so the test server is accessible only locally
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    // After listening, address() returns an object like:
    // { address: "127.0.0.1", family: "IPv4", port: 41234 }
    const { port } = server.address() as AddressInfo;
    return {
        baseURL: `http://127.0.0.1:${port}`,
        close: async () => {
            server.closeAllConnections();
            server.close();
            await once(server, "close");
        }
    };
};
