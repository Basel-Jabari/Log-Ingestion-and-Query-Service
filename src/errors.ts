export class HTTPError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export class BadRequestError extends HTTPError {
    constructor(message: string) {
        super(400, message);
    }
}

export class UnauthorizedError extends HTTPError {
    constructor(message: string) {
        super(401, message);
    }
}

export class ForbiddenError extends HTTPError {
    constructor(message: string) {
        super(403, message);
    }
}

export class NotFoundError extends HTTPError {
    constructor(message: string) {
        super(404, message);
    }
}
