import { db } from "../db.js";
import { logs, NewLog } from "../schema.js";

export const insertLogs = async (Logs: NewLog[]) => {
    await db.insert(logs).values(Logs);
};
