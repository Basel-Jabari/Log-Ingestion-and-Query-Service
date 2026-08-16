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
            Bucket: {
                type: "object",
                additionalProperties: false,
                required: ["start", "group", "count"],
                properties: {
                    start: {
                        type: "string",
                        format: "date-time",
                        description: "Start of the bucket. Buckets are aligned with since, not with the clock."
                    },
                    group: {
                        type: ["string", "null"],
                        description: "The grouped value, or null when group_by was not given."
                    },
                    count: {
                        type: "integer",
                        description: "How many logs fell into this bucket."
                    }
                }
            },
            BucketPage: {
                type: "object",
                additionalProperties: false,
                required: ["buckets"],
                properties: {
                    buckets: {
                        type: "array",
                        items: {
                            $ref: "#/components/schemas/Bucket"
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
        "/logs/aggregate": {
            get: {
                operationId: "aggregateLogs",
                summary: "Count logs in time buckets",
                description:
                    "Counts the logs that match the filters and splits them into buckets of equal length. " +
                    "The filters are the same as on GET /logs, but the range and the bucket size are required. " +
                    "Buckets start at since, so a range of 14:00 to 15:00 with bucket=1m starts at 14:00 exactly. " +
                    "Empty buckets are left out and the rows come back oldest first.",
                tags: ["Logs"],
                parameters: [
                    {
                        name: "since",
                        in: "query",
                        required: true,
                        description: "Inclusive start of the range, and the point the buckets are aligned with.",
                        schema: {
                            type: "string",
                            format: "date-time"
                        },
                        example: "2026-07-20T14:00:00Z"
                    },
                    {
                        name: "until",
                        in: "query",
                        required: true,
                        description: "Exclusive end of the range.",
                        schema: {
                            type: "string",
                            format: "date-time"
                        },
                        example: "2026-07-20T15:00:00Z"
                    },
                    {
                        name: "bucket",
                        in: "query",
                        required: true,
                        description: "Length of one bucket.",
                        schema: {
                            type: "string",
                            enum: ["1m", "5m", "1h", "1d"]
                        },
                        example: "1m"
                    },
                    {
                        name: "group_by",
                        in: "query",
                        description: "Split each bucket by this dimension. Left out, every group is null.",
                        schema: {
                            type: "string",
                            enum: ["service", "level"]
                        }
                    },
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
                        name: "attr.<key>",
                        in: "query",
                        description: "Attribute equality, compared as strings, written as attr.user_id=42.",
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
                    }
                ],
                responses: {
                    "200": {
                        description: "One row for every bucket and group that holds at least one log.",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/BucketPage"
                                },
                                example: {
                                    buckets: [
                                        {
                                            start: "2026-07-20T14:00:00.000Z",
                                            group: "auth",
                                            count: 42
                                        },
                                        {
                                            start: "2026-07-20T14:00:00.000Z",
                                            group: "checkout",
                                            count: 118
                                        },
                                        {
                                            start: "2026-07-20T14:01:00.000Z",
                                            group: "checkout",
                                            count: 97
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    "400": {
                        description:
                            "A parameter was invalid or missing, such as an absent since, until or bucket, " +
                            "an unsupported bucket size, an unknown group_by, or until earlier than since.",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Error"
                                },
                                example: {
                                    error: "invalid bucket: '30s'"
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
