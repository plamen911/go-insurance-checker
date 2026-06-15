# go-insurance-checker

An [MCP](https://modelcontextprotocol.io) server that checks whether a Bulgarian
vehicle has active mandatory motor third-party liability insurance
("Гражданска отговорност" / **GO**).

## Usage (no install)

Add it to your MCP client config and let `npx` fetch it on first run:

```json
{
  "mcpServers": {
    "go-insurance-checker": {
      "command": "npx",
      "args": ["-y", "go-insurance-checker"]
    }
  }
}
```

That's it — no clone, no manual dependency install. `npx` downloads and caches
the package the first time the client launches it.

## Tool

### `check_active_go`

| Argument     | Type               | Description                                          |
| ------------ | ------------------ | ---------------------------------------------------- |
| `car_no`     | string (required)  | Registration / license plate number, e.g. `CB8495HM` |
| `check_date` | string (optional)  | Date to check, `YYYY-MM-DD`. Defaults to today.       |

Returns a Bulgarian-language summary of the insurance status.

## Local development

```bash
npm install
npm run build      # compile TypeScript -> build/
npm run inspect    # build and open the MCP Inspector against the server
```

## License

MIT
