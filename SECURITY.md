# Security

## Reporting a vulnerability

Use GitHub's private reporting: **Security → Report a vulnerability** on
<https://github.com/smeet666/mcp-recipes/security/advisories/new>. It reaches me
without the report being public first.

Please do not open a public issue for something exploitable.

I will acknowledge within a few days. This is a single-maintainer project, so
treat that as a best effort rather than a service commitment.

## What is in scope

This server is a read-only client for public recipe websites, currently
marmiton.org and en.wikibooks.org. It holds no credentials, needs no API key,
opens no port, and writes nothing back. That rules out most of what a vulnerability report usually concerns.

What remains is worth reporting:

- **Anything that lets a caller reach a host other than the ones a registered
  source declares.** Identifiers are routed in `src/sources/ids.ts`, and an
  address on any other host is refused. An argument that escapes that is a real
  finding.
- **Anything upstream text can do to the caller.** Titles, ingredients and steps
  come from a third party and end up in front of a model. A path by which that
  text could be read as instructions rather than as content is in scope, and so
  is anything that could make it look like this server's own words. Lines opening
  `Note:` or `Source:` are indented before rendering for exactly that reason; a
  way past that guard is a finding.
- **Anything that turns a failure into a confident answer.** A crafted response
  that makes the server report "there is no such recipe" when it means "I could
  not ask" is a correctness bug with real consequences, and I treat it as
  security.
- **Anything that defeats the pacing.** The floor on the interval between two
  requests to one source exists so this client cannot be turned into a load generator
  against sites that serve everyone free of charge. A way past it is a finding,
  including through the published client entry point.
- **Anything that makes the server do unbounded work on a bounded input.** A
  regular expression that backtracks catastrophically on a crafted ingredient
  line, or an input size the schemas fail to bound, is in scope.
- **Dependency vulnerabilities** that are actually reachable from this code.

## What is not in scope

- **What a source itself publishes.** A recipe that is wrong, unsafe or
  offensive is a matter for the site that published it. This server repeats what
  it reads and links back to it.
- **Rate limiting by a source.** Being asked to slow down is the system working.
- **A recipe scaled to a quantity you disagree with.** That is a correctness
  report, and it belongs in an issue rather than an advisory. It is welcome
  there.

## What the server does with what it reads

Everything a source publishes travels in two forms. The structured payload keeps
the text exactly as published. The text block puts it on a single line, defuses
markdown image syntax, and indents anything that would otherwise imitate a line
this server writes. Nothing fetched is executed,
evaluated, or used to build a request.

Logs go to stderr and never to stdout, because stdout carries the protocol and a
stray line there corrupts the session.
