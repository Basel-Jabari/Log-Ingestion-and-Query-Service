import { HTTPError } from "../errors.js";
import { ErrorMiddleWare } from "./middleware.js";

export const middlewareErrorHandler: ErrorMiddleWare = (err, _req, res, _next) => {
    let errorJSON = {};
    if (err instanceof Error) {
        errorJSON = {
            error: err.message
        };
    } else {
        errorJSON = {
            error: "Something went wrong on our side!"
        };
    }

    if (err instanceof HTTPError) {
        res.status(err.status).json(errorJSON);
    } else {
        res.status(500).json(errorJSON);
    }
};
