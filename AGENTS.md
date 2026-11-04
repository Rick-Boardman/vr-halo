# Halo contributor and agent instructions

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[docs/quick-start.md](docs/quick-start.md) before changing code. Developers and AI
coding agents may use, modify, redistribute, and contribute under Apache-2.0.
Third-party material keeps its own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md).

Halo owns the generic scene rig, frame loop, navigation, input, WebGL HUD,
selection, and WebXR plumbing. Graph, workflow, game rules, and persistence belong
in Lattice or the consuming application.

Keep public module paths stable. Do not introduce credentials, private service
URLs, machine-specific setup, or dependencies on neighboring checkouts. Follow
the existing ES module style. Retain useful API comments and explain unusual
render-order, coordinate-system, and device constraints. Do not add a second
Three.js instance to an application. Dispose listeners and graphics resources.

Run `npm run build`, `npm run test:browser`, and `npm run audit:release`.
Report actual results and device limitations; do not claim physical Quest testing
from a simulated XR session. Document public API or installation changes.
