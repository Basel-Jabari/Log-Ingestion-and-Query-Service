import type { OpenAPIV3_1 } from "openapi-types";

export const openApiDocument: OpenAPIV3_1.Document = {
    openapi: "3.1.0",
    info: {
        title: "Log Ingestion and Query Service API",
        version: "1.0.0"
    },
    servers: [
        {
            url: "/"
        }
    ],
    tags: [
        {
            name: "Health",
            description: "Service readiness"
        }
    ],
    paths: {
        "/health": {
            get: {
                operationId: "getHealth",
                summary: "Get service readiness",
                tags: ["Health"],
                responses: {
                    "200": {
                        description: "The service is ready to accept requests.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["status"],
                                    properties: {
                                        status: {
                                            type: "string",
                                            enum: ["ready"]
                                        }
                                    }
                                },
                                example: {
                                    status: "ready"
                                }
                            }
                        }
                    },
                    "500": {
                        description: "The service is not ready to accept requests.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["status"],
                                    properties: {
                                        status: {
                                            type: "string",
                                            enum: ["not-ready"]
                                        }
                                    }
                                },
                                example: {
                                    status: "not-ready"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
