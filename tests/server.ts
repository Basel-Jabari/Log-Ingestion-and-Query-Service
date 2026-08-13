import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { app } from "../src/app.js";

export const startTestServer = async () => {
    // Port 0 means => Give me any free port
    // "127.0.0.1" keeps the server on your machine only
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    // After listening on a port, address() is an object like
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
