# Case study: automating the Bulgarian motor-insurance (GO) check

**Project:** `go-insurance-checker` (this MCP server) and the GO check service behind it
**Author:** Plamen Markov – design and implementation
**Used by:** v3.zastrahovaite.com, an online insurance brokerage, and any MCP client (Claude Desktop, Claude Code)

## The problem

Before selling a mandatory motor third-party liability policy ("Гражданска отговорност", GO),
the seller has to know whether the vehicle is already insured, until when, and with which insurer.
That decides whether a new policy can be sold at all and from which date it can start.

The authoritative source is the official register of the Bulgarian Guarantee Fund. Its lookup is a
web page meant for people, not an API. Before this project, every check meant a person opening the
page, entering the plate number and reading the result, and the online sales form could not use the
answer.

## The solution

Three layers, each replaceable:

1. **Check service.** A dedicated service automates the check in the official register: it submits
   the plate number and returns structured JSON with whether the policy is active, the insurer,
   valid from and to, and the policy number. One check takes about 5–15 seconds.
2. **Laravel backend (zastrahovaite).** Validates and normalises the plate (Cyrillic or Latin
   input), calls the check through one `ActiveGoCheckInterface`, and turns the answer into sales
   rules:
   - whether the vehicle may be insured now (the current policy expires within 30 days);
   - the earliest start date for the new policy (the day after the current one expires);
   - the date range the order form's calendar allows.
   The Guarantee Fund, the Boleron broker API and the Bulstrad insurer API are interchangeable
   implementations of the same interface. Switching the source is a one-line binding change.
3. **MCP server (this repository).** Exposes the check as one tool, `check_active_go(car_no,
   check_date?)`, to any MCP client. It is published on npm and runs with `npx -y
   go-insurance-checker`: no clone, no install. It has a 30-second timeout so a call can't hang, and
   formatted Bulgarian output.

## Results

- **The check in the official register is automated** and available to software: to the
  brokerage's online sales form and to AI assistants through MCP.
- **The sales form decides on its own** whether a car can be insured and from which date, instead
  of asking the customer or an operator to look it up.
- **About 5–15 seconds per check**, end to end, with one automatic retry on a transient failure.
- **Zero-install distribution:** one JSON block in an MCP client's config.
- **Provider-independent:** three data sources behind one interface, so the product survives a
  change or outage of any single source.

## What made it work

- **Separate the hard part.** Access to the register lives in its own service, behind an API key,
  so neither the web application nor the MCP server needs to know how the register is reached.
- **One interface, several sources.** The check was designed as a contract first, so the data
  source could change from a broker API to an insurer API to the official register without touching
  the sales flow.
- **Port without behaviour change.** The first MCP server was Python (FastMCP). The TypeScript
  port kept the tool signature, the request and the output byte-for-byte identical, so existing
  clients saw no difference.
