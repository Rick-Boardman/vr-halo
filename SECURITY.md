# Security policy

Security fixes target the latest release. Older releases are supported only when
a fix is explicitly backported; upgrade to the latest release before reporting.

Report suspected vulnerabilities privately through
[GitHub's Report a vulnerability form](https://github.com/Rick-Boardman/vr-halo/security/advisories/new).
Do not disclose exploit details or credentials in public issues or pull requests.
Include affected versions, impact, reproduction steps, and a minimal example
using synthetic data. Never include live credentials or private customer data.
There is no guaranteed response or remediation deadline; maintainers will assess
reports and coordinate a fix and disclosure as capacity permits.

Halo runs in the consuming application's browser context. Applications own
origin policy, authorization, network transports, and validation of untrusted
data. A documentation example is not an authentication or sandbox boundary.
