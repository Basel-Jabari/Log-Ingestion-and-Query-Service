import { HTTPError } from "../errors.js";
import { ErrorMiddleWare } from "./middleware.js";

export const middlewareErrorHandler: ErrorMiddleWare = (err, _req, res, _next) => {
    let errorJSON = {
        error: "Something went wrong on our side!"
    };
    if (err instanceof Error) {
        errorJSON = {
            error: err.message
        };
    }

    let status = 500;
    const errWithStatus = err as {
        status?: unknown;
    };
    if (typeof errWithStatus.status === "number") {
        status = errWithStatus.status;
    }

    if (status === 503) {
        res.setHeader("Retry-After", "1");
    }

    res.status(status).json(errorJSON);
};
