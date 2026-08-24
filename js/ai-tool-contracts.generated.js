// AUTO-GENERATED from shared/ai-tool-contracts.json — DO NOT EDIT.
// Run: node scripts/generate-ai-tool-contracts.mjs
'use strict';
(function (root, factory) {
  const contracts = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = contracts;
  else root.TaskFlowAIToolContracts = contracts;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return [
  {
    "name": "get_today",
    "description": "Get today's date in YYYY-MM-DD format.",
    "category": "read",
    "safety": "read",
    "executionLocation": "server",
    "returnsProposal": false,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "today": {
          "type": "string"
        }
      },
      "required": [
        "today"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "get_tasks",
    "description": "Get current tasks with optional filter.",
    "category": "read",
    "safety": "read",
    "executionLocation": "client",
    "returnsProposal": false,
    "inputSchema": {
      "type": "object",
      "properties": {
        "filter": {
          "type": "string",
          "enum": [
            "all",
            "active",
            "completed",
            "today",
            "upcoming",
            "overdue"
          ]
        },
        "limit": {
          "type": "number",
          "minimum": 1,
          "maximum": 100
        }
      },
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "tasks": {
          "type": "array",
          "maxItems": 60,
          "items": {
            "type": "object",
            "properties": {
              "uid": {
                "type": "string"
              },
              "text": {
                "type": "string",
                "maxLength": 300
              },
              "done": {
                "type": "boolean"
              },
              "deadline": {
                "type": "string"
              },
              "scheduledDate": {
                "type": "string"
              },
              "duration": {
                "type": "number"
              }
            },
            "additionalProperties": false
          }
        },
        "total": {
          "type": "number"
        }
      },
      "required": [
        "tasks",
        "total"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "get_projects",
    "description": "Get projects and milestones.",
    "category": "read",
    "safety": "read",
    "executionLocation": "client",
    "returnsProposal": false,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "projects": {
          "type": "array",
          "maxItems": 20
        }
      },
      "required": [
        "projects"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "get_active_roadmap",
    "description": "Get active document daily plan roadmap and cursor.",
    "category": "read",
    "safety": "read",
    "executionLocation": "client",
    "returnsProposal": false,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "roadmap": {},
        "cursor": {},
        "documentName": {
          "type": "string"
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "get_plan_progress",
    "description": "Get document plan progress statistics.",
    "category": "read",
    "safety": "read",
    "executionLocation": "client",
    "returnsProposal": false,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "hasActivePlan": {
          "type": "boolean"
        },
        "documentName": {
          "type": "string",
          "maxLength": 200
        },
        "roadmapTitle": {
          "type": "string",
          "maxLength": 200
        },
        "totalWeeks": {
          "type": "number",
          "minimum": 0,
          "maximum": 500
        },
        "cursor": {
          "type": "object"
        }
      },
      "required": [
        "hasActivePlan"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "get_free_time",
    "description": "Get busy time slots for a date range from timeblocks and calendar.",
    "category": "read",
    "safety": "read",
    "executionLocation": "client",
    "returnsProposal": false,
    "inputSchema": {
      "type": "object",
      "properties": {
        "startDate": {
          "type": "string",
          "format": "date"
        },
        "daysCount": {
          "type": "number",
          "minimum": 1,
          "maximum": 14
        }
      },
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "busy": {
          "type": "array",
          "maxItems": 100
        },
        "startDate": {
          "type": "string"
        },
        "daysCount": {
          "type": "number"
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "generate_daily_plan",
    "description": "Generate daily tasks from an active roadmap for a date range. Returns a canonical proposal with create_task actions.",
    "category": "planning",
    "safety": "safe_proposal",
    "executionLocation": "client",
    "returnsProposal": true,
    "inputSchema": {
      "type": "object",
      "properties": {
        "startDate": {
          "type": "string",
          "format": "date"
        },
        "daysCount": {
          "type": "number",
          "minimum": 1,
          "maximum": 14
        }
      },
      "required": [
        "startDate"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "proposal": {},
        "meta": {}
      },
      "required": [
        "ok"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "propose_create_task",
    "description": "Create a proposal to add a new task. Returns a canonical proposal with create_task actions.",
    "category": "mutation_proposal",
    "safety": "safe_proposal",
    "executionLocation": "client",
    "returnsProposal": true,
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 300
        },
        "date": {
          "type": "string",
          "format": "date"
        },
        "duration": {
          "type": "number",
          "minimum": 1,
          "maximum": 480
        },
        "priority": {
          "type": "boolean"
        },
        "projectId": {
          "type": "string"
        },
        "milestoneId": {
          "type": "string"
        }
      },
      "required": [
        "text"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "proposal": {}
      },
      "required": [
        "ok",
        "proposal"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "propose_complete_task",
    "description": "Create a proposal to mark a task as done.",
    "category": "mutation_proposal",
    "safety": "safe_proposal",
    "executionLocation": "client",
    "returnsProposal": true,
    "inputSchema": {
      "type": "object",
      "properties": {
        "taskUid": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "taskUid"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "proposal": {}
      },
      "required": [
        "ok",
        "proposal"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "propose_reschedule_task",
    "description": "Create a proposal to move a task to a different date.",
    "category": "mutation_proposal",
    "safety": "safe_proposal",
    "executionLocation": "client",
    "returnsProposal": true,
    "inputSchema": {
      "type": "object",
      "properties": {
        "taskUid": {
          "type": "string",
          "minLength": 1
        },
        "newDate": {
          "type": "string",
          "format": "date"
        }
      },
      "required": [
        "taskUid",
        "newDate"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "proposal": {}
      },
      "required": [
        "ok",
        "proposal"
      ],
      "additionalProperties": false
    }
  }
];
});
