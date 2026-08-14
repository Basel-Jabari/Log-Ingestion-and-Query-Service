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
        },
        {
            name: "Logs",
            description: "Log ingestion"
        }
    ],
    components: {
        schemas: {
            LogEntry: {
                type: "object",
                additionalProperties: false,
                required: ["timestamp", "level", "service", "message"],
                properties: {
                    timestamp: {
                        type: "string",
                        format: "date-time",
                        description: "ISO 8601 timestamp, no more than five minutes in the future."
                    },
                    level: {
                        type: "string",
                        enum: ["debug", "info", "warn", "error"]
                    },
                    service: {
                        type: "string",
                        minLength: 1
                    },
                    message: {
                        type: "string",
                        minLength: 1
                    },
                    attributes: {
                        type: "object",
                        description: "Flat object. Nested objects and arrays are not allowed.",
                        additionalProperties: {
                            oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
                        }
                    }
                }
            },
            BatchResult: {
                type: "object",
                additionalProperties: false,
                required: ["accepted", "rejected"],
                properties: {
                    accepted: {
                        type: "integer",
                        description: "Number of entries stored."
                    },
                    rejected: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            required: ["index", "reason"],
                            properties: {
                                index: {
                                    type: "integer",
                                    description: "Position of the invalid entry in the request array."
                                },
                                reason: {
                                    type: "string"
                                }
                            }
                        }
                    }
                }
            },
            Error: {
                type: "object",
                additionalProperties: false,
                required: ["error"],
                properties: {
                    error: {
                        type: "string"
                    }
                }
            }
        }
    },
    paths: {
        "/logs": {
            post: {
                operationId: "ingestLogs",
                summary: "Ingest a batch of logs",
                description:
                    "Always accepts a batch; a batch of one is valid. Invalid entries are rejected individually " +
                    "without failing the whole batch.",
                tags: ["Logs"],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                additionalProperties: false,
                                required: ["logs"],
                                properties: {
                                    logs: {
                                        type: "array",
                                        minItems: 1,
                                        items: {
                                            $ref: "#/components/schemas/LogEntry"
                                        }
                                    }
                                }
                            },
                            example: {
                                logs: [
                                    {
                                        timestamp: "2026-07-20T14:32:01.123Z",
                                        level: "error",
                                        service: "checkout",
                                        message: "payment declined",
                                        attributes: {
                                            user_id: "42",
                                            region: "eu-west",
                                            retries: 3
                                        }
                                    }
                                ]
                            }
                        }
                    }
                },
                responses: {
                    "200": {
                        description: "At least one entry was accepted.",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/BatchResult"
                                },
                                example: {
                                    accepted: 9,
                                    rejected: [
                                        {
                                            index: 3,
                                            reason: "invalid level: 'critical'"
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    "400": {
                        description:
                            "Every entry was rejected, the JSON was malformed, or the top-level structure was wrong.",
                        content: {
                            "application/json": {
                                schema: {
                                    oneOf: [
                                        {
                                            $ref: "#/components/schemas/BatchResult"
                                        },
                                        {
                                            $ref: "#/components/schemas/Error"
                                        }
                                    ]
                                },
                                example: {
                                    accepted: 0,
                                    rejected: [
                                        {
                                            index: 0,
                                            reason: "missing message"
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        },
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
