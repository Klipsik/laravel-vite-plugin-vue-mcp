'use strict';

const mcp_js = require('@modelcontextprotocol/sdk/server/mcp.js');
const nanoid = require('nanoid');
const zod = require('zod');

const version = "1.0.0";

function createMcpServerDefault(options, vite, ctx) {
  const server = new mcp_js.McpServer(
    {
      name: "vite",
      version,
      ...options.mcpServerInfo
    }
  );
  server.tool(
    "get-component-tree",
    "Get the Vue component tree in markdown tree syntax format.",
    {},
    async () => {
      return new Promise((resolve) => {
        const eventName = nanoid.nanoid();
        ctx.hooks.hookOnce(eventName, (res) => {
          resolve({
            content: [{
              type: "text",
              text: JSON.stringify(res)
            }]
          });
        });
        ctx.rpcServer.getInspectorTree({ event: eventName });
      });
    }
  );
  server.tool(
    "get-component-state",
    "Get the Vue component state in JSON structure format.",
    {
      componentName: zod.z.string()
    },
    async ({ componentName }) => {
      return new Promise((resolve) => {
        const eventName = nanoid.nanoid();
        ctx.hooks.hookOnce(eventName, (res) => {
          resolve({
            content: [{
              type: "text",
              text: JSON.stringify(res)
            }]
          });
        });
        ctx.rpcServer.getInspectorState({ event: eventName, componentName });
      });
    }
  );
  server.tool(
    "edit-component-state",
    "Edit the Vue component state.",
    {
      componentName: zod.z.string(),
      path: zod.z.array(zod.z.string()),
      value: zod.z.string(),
      valueType: zod.z.enum(["string", "number", "boolean", "object", "array"])
    },
    async ({ componentName, path, value, valueType }) => {
      return new Promise((resolve) => {
        ctx.rpcServer.editComponentState({ componentName, path, value, valueType });
        resolve({
          content: [{
            type: "text",
            text: "ok"
          }]
        });
      });
    }
  );
  server.tool(
    "highlight-component",
    "Highlight the Vue component.",
    {
      componentName: zod.z.string()
    },
    async ({ componentName }) => {
      return new Promise((resolve) => {
        ctx.rpcServer.highlightComponent({ componentName });
        resolve({
          content: [{
            type: "text",
            text: "ok"
          }]
        });
      });
    }
  );
  server.tool(
    "get-router-info",
    "Get the Vue router info in JSON structure format.",
    {},
    async () => {
      return new Promise((resolve) => {
        const eventName = nanoid.nanoid();
        ctx.hooks.hookOnce(eventName, (res) => {
          resolve({
            content: [{
              type: "text",
              text: JSON.stringify(res)
            }]
          });
        });
        ctx.rpcServer.getRouterInfo({ event: eventName });
      });
    }
  );
  server.tool(
    "get-pinia-state",
    "Get the Pinia state in JSON structure format.",
    {
      storeName: zod.z.string()
    },
    async ({ storeName }) => {
      return new Promise((resolve) => {
        const eventName = nanoid.nanoid();
        ctx.hooks.hookOnce(eventName, (res) => {
          resolve({
            content: [{
              type: "text",
              text: JSON.stringify(res)
            }]
          });
        });
        ctx.rpcServer.getPiniaState({ event: eventName, storeName });
      });
    }
  );
  server.tool(
    "get-pinia-tree",
    "Get the Pinia tree in JSON structure format.",
    {},
    async () => {
      return new Promise((resolve) => {
        const eventName = nanoid.nanoid();
        ctx.hooks.hookOnce(eventName, (res) => {
          resolve({
            content: [{
              type: "text",
              text: JSON.stringify(res)
            }]
          });
        });
        ctx.rpcServer.getPiniaTree({ event: eventName });
      });
    }
  );
  return server;
}

exports.createMcpServerDefault = createMcpServerDefault;
