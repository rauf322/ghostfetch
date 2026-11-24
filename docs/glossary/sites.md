# Sites

Where Ghostfetch runs: on the hosts it's built for and the sites the user adds, and nowhere else.
One of Ghostfetch's bounded contexts ([Glossary Map](../../GLOSSARY-MAP.md)). Rules know nothing
of sites: a rule answers on every site Ghostfetch runs on.

## Language

**Site**:
A hostname or an IP address that Ghostfetch can run on. A hostname covers its subdomains; an
address covers only itself.
_Avoid_: domain, origin, URL

**Built-in host**:
A host Ghostfetch always runs on: localhost, any name under .localhost, 127.0.0.1, and any name
that starts with "local." and a letter or a digit.
_Avoid_: default site, dev host (Agent access's word)

**Added site**:
A site the user turned Ghostfetch on for. Turning it off there takes it away.
_Avoid_: allowed site, whitelisted site, custom site

**Runs on**:
Ghostfetch runs on a page whose host is a built-in host or is covered by an added site. On any
other page nothing of Ghostfetch is there.
_Avoid_: enabled for, active on, injected into
