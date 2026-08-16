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
            LogRecord: {
                type: "object",
                additionalProperties: false,
                required: ["id", "timestamp", "level", "service", "message", "attributes"],
                properties: {
                    id: {
                        type: "string",
                        description: "Unique identifier of the stored entry."
                    },
                    timestamp: {
                        type: "string",
                        format: "date-time"
                    },
                    level: {
                        type: "string",
                        enum: ["debug", "info", "warn", "error"]
                    },
                    service: {
                        type: "string"
                    },
                    message: {
                        type: "string"
                    },
                    attributes: {
                        type: "object",
                        additionalProperties: {
                            oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
                        }
                    }
                }
            },
            LogPage: {
                type: "object",
                additionalProperties: false,
                required: ["logs", "next_cursor"],
                properties: {
                    logs: {
                        type: "array",
                        items: {
                            $ref: "#/components/schemas/LogRecord"
                        }
                    },
                    next_cursor: {
                        type: ["string", "null"],
                        description:
                            "Pass this back as the cursor parameter to read the next page. " +
                            "Null when no further results are available."
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
            },
            get: {
                operationId: "queryLogs",
                summary: "Query stored logs",
                description:
                    "Every parameter is optional and they may be freely combined. Results are sorted by timestamp " +
                    "descending, with the id breaking ties so the order stays stable across pages.",
                tags: ["Logs"],
                parameters: [
                    {
                        name: "service",
                        in: "query",
                        description: "Exact service name match.",
                        schema: {
                            type: "string"
                        },
                        example: "checkout"
                    },
                    {
                        name: "level",
                        in: "query",
                        description: "Exact level match.",
                        schema: {
                            type: "string",
                            enum: ["debug", "info", "warn", "error"]
                        }
                    },
                    {
                        name: "since",
                        in: "query",
                        description: "Inclusive start of the time range.",
                        schema: {
                            type: "string",
                            format: "date-time"
                        },
                        example: "2026-07-20T14:00:00Z"
                    },
                    {
                        name: "until",
                        in: "query",
                        description: "Exclusive end of the time range.",
                        schema: {
                            type: "string",
                            format: "date-time"
                        },
                        example: "2026-07-20T15:00:00Z"
                    },
                    {
                        name: "attr.<key>",
                        in: "query",
                        description:
                            "Attribute equality, compared as strings, written as attr.user_id=42. " +
                            "Several attribute filters may be combined, and a stored number matches its text form.",
                        schema: {
                            type: "string"
                        }
                    },
                    {
                        name: "q",
                        in: "query",
                        description: "Case-insensitive substring match on the message.",
                        schema: {
                            type: "string"
                        },
                        example: "declined"
                    },
                    {
                        name: "limit",
                        in: "query",
                        description: "Maximum number of results.",
                        schema: {
                            type: "integer",
                            minimum: 1,
                            maximum: 1000,
                            default: 100
                        }
                    },
                    {
                        name: "cursor",
                        in: "query",
                        description: "Opaque cursor returned as next_cursor by a previous response.",
                        schema: {
                            type: "string"
                        }
                    }
                ],
                responses: {
                    "200": {
                        description: "A page of logs, oldest results reachable through next_cursor.",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/LogPage"
                                },
                                example: {
                                    logs: [
                                        {
                                            id: "12345",
                                            timestamp: "2026-07-20T14:32:01.123Z",
                                            level: "error",
                                            service: "checkout",
                                            message: "payment declined",
                                            attributes: {
                                                user_id: "42"
                                            }
                                        }
                                    ],
                                    next_cursor: "eyJ0IjoiMjAyNi0wNy0yMFQxNDozMjowMS4xMjNaIiwiaSI6IjEyMzQ1In0"
                                }
                            }
                        }
                    },
                    "400": {
                        description:
                            "A parameter was invalid, such as a malformed timestamp or cursor, an unsupported " +
                            "level, until earlier than since, or a limit outside 1 to 1000.",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Error"
                                },
                                example: {
                                    error: "limit must be an integer between 1 and 1000: '5000'"
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
